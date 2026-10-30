import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateManager } from '../src/main/update-manager'
import type { UpdateFetch } from '../src/main/update-download'
import type { UpdateState } from '../src/shared/contracts'
import { githubRelease, installerBytes, repo } from './update-fixtures'

const directories: string[] = []
async function setup(options: { version?: string; packaged?: boolean; release?: unknown; fetch?: UpdateFetch } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'stealth-update-manager-'))
  directories.push(directory)
  const states: UpdateState[] = []
  const openInstaller = vi.fn(async (_file: string, _portable: boolean) => {})
  const openExternal = vi.fn(async (_url: string) => {})
  const fetch = options.fetch ?? vi.fn(async (url: string) => url.includes('/releases/latest')
    ? Response.json(options.release ?? githubRelease()) : new Response(installerBytes))
  const manager = new UpdateManager({
    version: options.version ?? '0.1.1', target: { platform: 'darwin', arch: 'arm64', portable: false },
    packaged: options.packaged ?? true, cacheDirectory: directory, fetch,
    onState: (state) => states.push(state), openInstaller, openExternal
  })
  return { manager, states, openInstaller, openExternal, fetch, directory }
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

describe('release update lifecycle', () => {
  it('checks without automatically downloading and exposes release notes and the selected package', async () => {
    const { manager, states, fetch } = await setup()
    const state = await manager.check()
    expect(state.status).toBe('available')
    expect(state.latest?.assetName).toBe('Stealth-Reader-0.2.0-arm64.dmg')
    expect(state.latest?.notes).toBe('修复与新功能')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(states.map((state) => state.status)).toEqual(['checking', 'available'])
  })

  it.each(['0.1.1', '0.3.0'])('does not offer a downgrade or same-version install to %s', async (version) => {
    const { manager } = await setup({ version, release: githubRelease('0.1.1') })
    expect((await manager.check()).status).toBe('up-to-date')
    expect((await manager.download()).status).toBe('up-to-date')
  })

  it('shows a missing architecture or missing checksum as unavailable rather than selecting the wrong package', async () => {
    const { manager } = await setup({ release: githubRelease('0.2.0', ['Stealth-Reader-0.2.0-x64.dmg']) })
    expect((await manager.check()).status).toBe('unsupported')
    const release = githubRelease()
    const unchecked = await setup({ release: { ...release, assets: release.assets.map((asset) => ({ ...asset, digest: null })) } })
    expect((await unchecked.manager.check()).message).toContain('SHA-256')
  })

  it('handles rate limits and retries without losing the installed version', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(Response.json(githubRelease()))
    const { manager } = await setup({ fetch })
    expect((await manager.check()).message).toContain('受限')
    expect((await manager.check()).status).toBe('available')
    expect(manager.getState().currentVersion).toBe('0.1.1')
  })

  it('coalesces concurrent checks into one network request', async () => {
    let resolve!: (value: Response) => void
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    const { manager } = await setup({ fetch })
    const first = manager.check()
    const second = manager.check()
    expect(second).toBe(first)
    resolve(Response.json(githubRelease()))
    await first
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('downloads and verifies, then opens the installer only after the explicit install action', async () => {
    const { manager, openInstaller } = await setup()
    await manager.check()
    expect((await manager.download()).status).toBe('downloaded')
    expect(openInstaller).not.toHaveBeenCalled()
    expect((await manager.install()).status).toBe('installing')
    expect(openInstaller).toHaveBeenCalledWith(expect.stringContaining('Stealth-Reader-0.2.0-arm64.dmg'), false, '0.2.0')
  })

  it('blocks installation in development builds', async () => {
    const { manager, openInstaller } = await setup({ packaged: false })
    await manager.check()
    await manager.download()
    expect((await manager.install()).message).toContain('开发模式')
    expect(openInstaller).not.toHaveBeenCalled()
  })

  it('describes restart installation on Mac without asking the user to drag a DMG', async () => {
    const { manager } = await setup()
    await manager.check()
    const state = await manager.download()
    expect(state.message).toContain('重启并安装更新')
    expect(state.message).not.toContain('拖入')
  })

  it('keeps the verified download retryable if preparation or permissions fail', async () => {
    const { manager, openInstaller } = await setup()
    await manager.check()
    await manager.download()
    openInstaller.mockRejectedValueOnce(new Error('当前应用目录不可写'))
    expect(await manager.install()).toMatchObject({ status: 'downloaded', message: '当前应用目录不可写' })
    expect((await manager.install()).status).toBe('installing')
    expect(openInstaller).toHaveBeenCalledTimes(2)
  })

  it('does not start two installers on concurrent clicks', async () => {
    const { manager, openInstaller } = await setup()
    await manager.check()
    await manager.download()
    await Promise.all([manager.install(), manager.install()])
    expect(openInstaller).toHaveBeenCalledTimes(1)
  })

  it('rechecks integrity at install time and blocks modified files', async () => {
    const { manager, openInstaller, directory } = await setup()
    await manager.check()
    await manager.download()
    const [cache] = await readdir(directory)
    const file = join(directory, cache, 'Stealth-Reader-0.2.0-arm64.dmg')
    await writeFile(file, Buffer.alloc(installerBytes.length))
    expect((await manager.install()).message).toContain('校验失败')
    expect(openInstaller).not.toHaveBeenCalled()
  })

  it('does not allow installation before a verified download', async () => {
    const second = await setup()
    await second.manager.install()
    expect(second.openInstaller).not.toHaveBeenCalled()
  })

  it('returns to the available state after cancellation and can retry the download', async () => {
    let shouldHang = true
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/releases/latest')) return Response.json(githubRelease())
      return shouldHang ? new Response(new ReadableStream({ start(stream) {
        stream.enqueue(installerBytes.subarray(0, 3))
      } })) : new Response(installerBytes)
    })
    const { manager } = await setup({ fetch })
    await manager.check()
    const download = manager.download()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect((await manager.cancel()).status).toBe('available')
    await download
    shouldHang = false
    expect((await manager.download()).status).toBe('downloaded')
  })

  it('does not expose download paths and opens only the fixed release URL', async () => {
    const { manager, openExternal } = await setup()
    await manager.check()
    await manager.download()
    expect(JSON.stringify(manager.getState())).not.toContain(tmpdir())
    await manager.openRelease()
    expect(openExternal).toHaveBeenCalledWith(`${repo}/releases/tag/v0.2.0`)
  })
})
