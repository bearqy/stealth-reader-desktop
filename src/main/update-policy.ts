import type { UpdateState } from '../shared/contracts'

export const RELEASE_REPOSITORY = 'bearqy/stealth-reader-desktop'
export const RELEASES_URL = `https://github.com/${RELEASE_REPOSITORY}/releases`
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`
export const MAX_UPDATE_BYTES = 1024 * 1024 * 1024

export interface UpdateTarget {
  platform: string
  arch: string
  portable: boolean
}

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  sha256: string | null
}

export interface ParsedRelease {
  version: string
  title: string
  notes: string
  publishedAt: string | null
  url: string
  assets: ReleaseAsset[]
}

export function stableVersion(value: string): string | null {
  const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(?:\+[\w.-]+)?$/.exec(value)
  return value.length <= 100 ? match?.[1] ?? null : null
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = stableVersion(candidate)?.split('.').map(BigInt)
  const installed = stableVersion(current)?.split('.').map(BigInt)
  if (!next || !installed) throw new Error('版本号格式无效，仅支持正式版本 x.y.z')
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index]
  }
  return false
}

export function targetPackage(target: UpdateTarget): UpdateState['packageType'] {
  if (!['arm64', 'x64'].includes(target.arch)) return null
  if (target.platform === 'darwin') return 'dmg'
  if (target.platform === 'win32') return target.portable ? 'portable' : 'nsis'
  return null
}

export function initialUpdateState(version: string, target: UpdateTarget, packaged: boolean): UpdateState {
  const packageType = targetPackage(target)
  return {
    status: packageType ? 'idle' : 'unsupported',
    currentVersion: version,
    system: target.platform === 'darwin' ? 'macOS' : target.platform === 'win32' ? 'Windows' : target.platform,
    architecture: target.arch,
    packageType,
    canInstall: packaged && packageType !== null,
    latest: null,
    checkedAt: null,
    progress: null,
    message: packageType
      ? '从 GitHub Releases 检查正式版本；下载与安装由你决定。'
      : '当前系统或架构暂无可用安装包。'
  }
}

export function assertDownloadUrl(value: string, initial = false): void {
  const url = new URL(value)
  const githubAsset = url.hostname === 'github.com' &&
    url.pathname.startsWith(`/${RELEASE_REPOSITORY}/releases/download/`)
  const allowedCdn = ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !(githubAsset || (!initial && allowedCdn))) {
    throw new Error('更新下载地址不属于受信任的 GitHub Releases')
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('GitHub 返回的版本信息格式无效')
  }
  return value as Record<string, unknown>
}

export function parseGitHubRelease(value: unknown): ParsedRelease {
  const raw = record(value)
  const version = typeof raw.tag_name === 'string' ? stableVersion(raw.tag_name) : null
  if (!version || raw.draft !== false || raw.prerelease !== false || !Array.isArray(raw.assets)) {
    throw new Error('GitHub 暂未提供可用的正式版本')
  }
  const assets: ReleaseAsset[] = []
  for (const value of raw.assets) {
    const asset = record(value)
    if (asset.state !== 'uploaded' || typeof asset.name !== 'string' ||
      typeof asset.browser_download_url !== 'string' || typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_UPDATE_BYTES) continue
    try {
      assertDownloadUrl(asset.browser_download_url, true)
      // Bind the asset to this exact tag and filename, including escaped spaces.
      const expected = `https://github.com/${RELEASE_REPOSITORY}/releases/download/${encodeURIComponent(String(raw.tag_name))}/${encodeURIComponent(asset.name)}`
      if (asset.browser_download_url !== expected) continue
    } catch { continue }
    assets.push({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      sha256: typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(asset.digest)
        ? asset.digest.slice(7).toLowerCase() : null
    })
  }
  return {
    version,
    title: typeof raw.name === 'string' ? raw.name.slice(0, 200) : `v${version}`,
    notes: typeof raw.body === 'string' ? raw.body.slice(0, 64_000) : '',
    publishedAt: typeof raw.published_at === 'string' ? raw.published_at : null,
    url: `${RELEASES_URL}/tag/${encodeURIComponent(String(raw.tag_name))}`,
    assets
  }
}

export function selectReleaseAsset(release: ParsedRelease, target: UpdateTarget): ReleaseAsset | null {
  const type = targetPackage(target)
  if (!type) return null
  const stem = type === 'dmg' ? 'Stealth-Reader' : type === 'nsis' ? 'Stealth-Reader-Setup' : 'Stealth-Reader-Portable'
  const extension = type === 'dmg' ? 'dmg' : 'exe'
  const names = [`${stem}-${release.version}-${target.arch}.${extension}`]
  if (type === 'dmg') names.push(`${stem}-${release.version}-universal.${extension}`)
  for (const name of names) {
    const asset = release.assets.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())
    if (asset) return asset
  }
  return null
}
