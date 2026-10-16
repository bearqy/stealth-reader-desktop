import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { assertDownloadUrl, type ReleaseAsset } from './update-policy'

export type UpdateFetch = (url: string, init?: RequestInit) => Promise<Response>
export type DownloadProgress = (received: number, total: number) => void

export async function verifyUpdateFile(file: string, asset: ReleaseAsset): Promise<void> {
  if (!asset.sha256) throw new Error('安装包缺少 SHA-256 校验信息，请前往发布页面下载')
  const info = await stat(file)
  if (!info.isFile() || info.size !== asset.size) throw new Error('安装包大小不符，请重新下载')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  if (hash.digest('hex') !== asset.sha256) throw new Error('安装包 SHA-256 校验失败，请重新下载')
}

async function fetchAsset(url: string, fetcher: UpdateFetch, signal: AbortSignal): Promise<Response> {
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    assertDownloadUrl(url, redirects === 0)
    const response = await fetcher(url, { redirect: 'manual', signal, credentials: 'omit' })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('GitHub 安装包下载跳转无效')
      url = new URL(location, url).href
      continue
    }
    if (!response.ok || !response.body) throw new Error(`安装包下载失败（HTTP ${response.status}），请稍后重试`)
    return response
  }
  throw new Error('安装包下载跳转次数过多')
}

export async function downloadUpdateFile(
  asset: ReleaseAsset,
  cacheDirectory: string,
  fetcher: UpdateFetch,
  signal: AbortSignal,
  onProgress: DownloadProgress
): Promise<string> {
  if (!asset.sha256) throw new Error('安装包缺少 SHA-256 校验信息，请前往发布页面下载')
  if (!/^[a-z0-9][a-z0-9._-]+\.(?:exe|dmg)$/i.test(asset.name)) throw new Error('安装包文件名无效')
  await mkdir(cacheDirectory, { recursive: true })
  const directory = await mkdtemp(join(cacheDirectory, 'download-'))
  const partial = join(directory, 'installer.part')
  const destination = join(directory, asset.name)
  try {
    const response = await fetchAsset(asset.url, fetcher, signal)
    const hash = createHash('sha256')
    let received = 0
    let lastNotification = 0
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (received > asset.size) {
          callback(new Error('安装包大小超出发布信息，请重新检查更新'))
          return
        }
        hash.update(chunk)
        const now = Date.now()
        if (now - lastNotification >= 150 || received === asset.size) {
          lastNotification = now
          onProgress(received, asset.size)
        }
        callback(null, chunk)
      }
    })
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream),
      meter,
      createWriteStream(partial, { flags: 'wx', mode: 0o600 }),
      { signal }
    )
    if (received !== asset.size) throw new Error('安装包下载不完整，请重新下载')
    if (hash.digest('hex') !== asset.sha256) throw new Error('安装包 SHA-256 校验失败，请重新下载')
    signal.throwIfAborted()
    await rename(partial, destination)
    return destination
  } catch (error) {
    // Only remove this operation's generated cache directory, never a user-selected path.
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}
