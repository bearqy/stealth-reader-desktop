import { session } from 'electron'
import { assertDownloadUrl, LATEST_RELEASE_API } from './update-policy'
import type { UpdateFetch } from './update-download'

export function createUpdateFetch(): UpdateFetch {
  // A separate, non-persistent session keeps update traffic away from website cookies.
  const updates = session.fromPartition('stealth-reader-updates', { cache: false })
  const requests = new Map<number, number>()
  updates.webRequest.onBeforeRequest((details, callback) => {
    try {
      if (details.url !== LATEST_RELEASE_API) assertDownloadUrl(details.url)
      const hops = (requests.get(details.id) ?? 0) + 1
      requests.set(details.id, hops)
      if (hops > 6) throw new Error('更新下载跳转次数过多')
      callback({ cancel: false })
    } catch {
      callback({ cancel: true })
    }
  })
  updates.webRequest.onCompleted((details) => { requests.delete(details.id) })
  updates.webRequest.onErrorOccurred((details) => { requests.delete(details.id) })
  // Electron fetch cancels manual redirects instead of returning a normal 302 Response.
  // Follow within this isolated session; onBeforeRequest validates every hop before sending.
  return (url, init) => updates.fetch(url, {
    ...init,
    redirect: init?.redirect === 'manual' ? 'follow' : init?.redirect
  })
}
