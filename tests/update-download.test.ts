import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadUpdateFile, verifyUpdateFile } from '../src/main/update-download'
import { asset, installerBytes } from './update-fixtures'

const directories: string[] = []
async function temp(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'stealth-update-test-'))
  directories.push(directory)
  return directory
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))) })

describe('verified installer downloads', () => {
  it('streams a verified package to a private cache and reports progress', async () => {
    const progress = vi.fn()
    const file = await downloadUpdateFile(asset(), await temp(), async () => new Response(installerBytes), new AbortController().signal, progress)
    expect(await readFile(file)).toEqual(installerBytes)
    expect(progress).toHaveBeenLastCalledWith(installerBytes.length, installerBytes.length)
    await expect(verifyUpdateFile(file, asset())).resolves.toBeUndefined()
  })

  it.each([
    ['truncated', installerBytes.subarray(0, 4)],
    ['oversized', Buffer.concat([installerBytes, Buffer.from('extra')])],
    ['wrong digest', Buffer.alloc(installerBytes.length)]
  ])('rejects a %s file and removes the partial download', async (_name, bytes) => {
    const directory = await temp()
    await expect(downloadUpdateFile(asset(), directory, async () => new Response(bytes), new AbortController().signal, () => {})).rejects.toThrow()
    expect(await readdir(directory)).toEqual([])
  })

  it('follows GitHub CDN redirects and refuses an offsite redirect', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/installer' } }))
      .mockResolvedValueOnce(new Response(installerBytes))
    await downloadUpdateFile(asset(), await temp(), fetcher, new AbortController().signal, () => {})
    expect(fetcher).toHaveBeenCalledTimes(2)
    const unsafe = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://example.org/installer' } }))
    await expect(downloadUpdateFile(asset(), await temp(), unsafe, new AbortController().signal, () => {})).rejects.toThrow('受信任')
    expect(unsafe).toHaveBeenCalledTimes(1)
  })

  it('cancels an in-progress stream and cleans its temporary directory', async () => {
    const directory = await temp()
    const controller = new AbortController()
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start(stream) { stream.enqueue(installerBytes.subarray(0, 3)) } })))
    const promise = downloadUpdateFile(asset(), directory, fetcher, controller.signal, () => {})
    const rejected = expect(promise).rejects.toThrow()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    controller.abort()
    await rejected
    expect(await readdir(directory)).toEqual([])
  })

  it('revalidates a downloaded file before handing it to the OS', async () => {
    const file = await downloadUpdateFile(asset(), await temp(), async () => new Response(installerBytes), new AbortController().signal, () => {})
    await writeFile(file, Buffer.alloc(installerBytes.length))
    await expect(verifyUpdateFile(file, asset())).rejects.toThrow('校验失败')
  })

  it('never downloads unchecked packages or unsafe filenames', async () => {
    const fetcher = vi.fn()
    await expect(downloadUpdateFile({ ...asset(), sha256: null }, await temp(), fetcher, new AbortController().signal, () => {})).rejects.toThrow('校验信息')
    await expect(downloadUpdateFile({ ...asset(), name: '../installer.exe' }, await temp(), fetcher, new AbortController().signal, () => {})).rejects.toThrow('文件名')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
