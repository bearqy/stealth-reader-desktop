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

  it('does not publish checking or error states for a failed background probe', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(Response.json(githubRelease()))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(installerBytes))
    const { manager, states } = await setup({ fetch })
    const initial = manager.getState()
    expect(await manager.checkInBackground()).toBe('failed')
    expect(manager.getState()).toEqual(initial)
    expect(states).toEqual([])
    expect(await manager.checkInBackground()).toBe('success')
    const offer = manager.getState()
    expect(offer.status).toBe('available')
    expect(await manager.checkInBackground()).toBe('failed')
    expect(manager.getState()).toEqual(offer)
    expect(states.map((state) => state.status)).toEqual(['available'])
    expect((await manager.download()).status).toBe('downloaded')
    expect(await manager.checkInBackground()).toBe('deferred')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('lets a manual check join an in-flight background check and displays its error', async () => {
    let finish!: (response: Response) => void
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve }))
    const { manager, states } = await setup({ fetch })
    const background = manager.checkInBackground()
    const manual = manager.check()
    manager.cancelBackgroundCheck()
    expect(manager.check()).toBe(manual)
    expect(fetch).toHaveBeenCalledTimes(1)
    finish(new Response(null, { status: 429 }))
    expect(await manual).toMatchObject({ status: 'error', message: expect.stringContaining('受限') })
    expect(await background).toBe('failed')
    expect(states.map((state) => state.status)).toEqual(['checking', 'error'])
  })

  it('aborts a slow background request on timeout without surfacing an error', async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const { manager, states } = await setup({ fetch })
    vi.useFakeTimers()
    try {
      const background = manager.checkInBackground()
      await vi.advanceTimersByTimeAsync(20_000)
      expect(await background).toBe('failed')
      expect(states).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let a late background response overwrite an explicit download', async () => {
    let finish!: (response: Response) => void
    let signal: AbortSignal | null | undefined
    let checks = 0
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes('/releases/latest')) return new Response(installerBytes)
      if (checks++ === 0) return Response.json(githubRelease())
      signal = init?.signal
      return new Promise<Response>((resolve) => { finish = resolve })
    })
    const { manager } = await setup({ fetch })
    await manager.checkInBackground()
    const background = manager.checkInBackground()
    const downloaded = await manager.download()
    expect(downloaded.status).toBe('downloaded')
    expect(signal?.aborted).toBe(true)
    finish(Response.json(githubRelease('0.3.0')))
    expect(await background).toBe('deferred')
    expect(manager.getState()).toEqual(downloaded)
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
