import { createHash } from 'node:crypto'
import type { ReleaseAsset } from '../src/main/update-policy'

export const installerBytes = Buffer.from('A test installer, never executed.')
export const digest = createHash('sha256').update(installerBytes).digest('hex')
export const repo = 'https://github.com/bearqy/stealth-reader-desktop'

export function asset(name = 'Stealth-Reader-0.2.0-arm64.dmg'): ReleaseAsset {
  return { name, url: `${repo}/releases/download/v0.2.0/${name}`, size: installerBytes.length, sha256: digest }
}

export function githubRelease(version = '0.2.0', names = [
  `Stealth-Reader-${version}-arm64.dmg`,
  `Stealth-Reader-${version}-x64.dmg`,
  `Stealth-Reader-Setup-${version}-x64.exe`,
  `Stealth-Reader-Portable-${version}-x64.exe`
]) {
  return {
    tag_name: `v${version}`, name: `Stealth Reader v${version}`, body: '修复与新功能',
    published_at: '2026-10-16T00:00:00Z', draft: false, prerelease: false,
    assets: names.map((name) => ({ name, state: 'uploaded', size: installerBytes.length,
      browser_download_url: `${repo}/releases/download/v${version}/${name}`, digest: `sha256:${digest}` }))
  }
}
