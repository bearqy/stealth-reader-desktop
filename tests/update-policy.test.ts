import { describe, expect, it } from 'vitest'
import { assertDownloadUrl, initialUpdateState, isNewerVersion, parseGitHubRelease, selectReleaseAsset, stableVersion } from '../src/main/update-policy'
import { githubRelease, repo } from './update-fixtures'

describe('update version policy', () => {
  it('compares numeric versions rather than sorting strings and never downgrades', () => {
    expect(isNewerVersion('v0.10.0', '0.9.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true)
    expect(isNewerVersion('0.1.2', '0.1.1')).toBe(true)
    expect(isNewerVersion('0.1.1', '0.1.1')).toBe(false)
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(false)
    expect(isNewerVersion('0.1.1+rebuild', '0.1.1')).toBe(false)
  })

  it('rejects prereleases, malformed versions and leading zeros', () => {
    for (const version of ['latest', '1.0', 'v1.0.1-beta.1', '01.0.1', '../1.0.0']) {
      expect(stableVersion(version)).toBeNull()
    }
    expect(() => isNewerVersion('1.0', '0.1.1')).toThrow('版本号')
  })
})

describe('platform and release matching', () => {
  const release = parseGitHubRelease(githubRelease())
  it('prefers standard names with explicit OS, architecture and installer type', () => {
    const names = ['StealthReader-0.2.0-macos-arm64.dmg', 'StealthReader-0.2.0-macos-x64.dmg',
      'StealthReader-0.2.0-windows-x64-setup.exe', 'StealthReader-0.2.0-windows-x64-portable.exe']
    const combined = parseGitHubRelease(githubRelease('0.2.0', [...release.assets.map(asset => asset.name), ...names]))
    expect(selectReleaseAsset(combined, { platform: 'darwin', arch: 'arm64', portable: false })?.name).toBe(names[0])
    expect(selectReleaseAsset(combined, { platform: 'darwin', arch: 'x64', portable: false })?.name).toBe(names[1])
    expect(selectReleaseAsset(combined, { platform: 'win32', arch: 'x64', portable: false })?.name).toBe(names[2])
    expect(selectReleaseAsset(combined, { platform: 'win32', arch: 'x64', portable: true })?.name).toBe(names[3])
    expect(selectReleaseAsset(combined, { platform: 'win32', arch: 'arm64', portable: false })).toBeNull()
  })

  it('supports universal standard names without accepting the wrong OS or package type', () => {
    const universal = parseGitHubRelease(githubRelease('0.2.0', ['StealthReader-0.2.0-macos-universal.dmg']))
    expect(selectReleaseAsset(universal, { platform: 'darwin', arch: 'arm64', portable: false })?.name).toContain('macos-universal')
    expect(selectReleaseAsset(universal, { platform: 'win32', arch: 'x64', portable: false })).toBeNull()
    const portable = parseGitHubRelease(githubRelease('0.2.0', ['StealthReader-0.2.0-windows-x64-portable.exe']))
    expect(selectReleaseAsset(portable, { platform: 'win32', arch: 'x64', portable: false })).toBeNull()
  })
  it('matches both macOS architectures and distinguishes Windows setup from portable', () => {
    expect(selectReleaseAsset(release, { platform: 'darwin', arch: 'arm64', portable: false })?.name).toBe('Stealth-Reader-0.2.0-arm64.dmg')
    expect(selectReleaseAsset(release, { platform: 'darwin', arch: 'x64', portable: false })?.name).toBe('Stealth-Reader-0.2.0-x64.dmg')
    expect(selectReleaseAsset(release, { platform: 'win32', arch: 'x64', portable: false })?.name).toBe('Stealth-Reader-Setup-0.2.0-x64.exe')
    expect(selectReleaseAsset(release, { platform: 'win32', arch: 'x64', portable: true })?.name).toBe('Stealth-Reader-Portable-0.2.0-x64.exe')
    expect(selectReleaseAsset(release, { platform: 'win32', arch: 'arm64', portable: false })).toBeNull()
  })

  it('supports a universal macOS package without falling back to the wrong architecture', () => {
    const universal = parseGitHubRelease(githubRelease('0.2.0', ['Stealth-Reader-0.2.0-universal.dmg']))
    expect(selectReleaseAsset(universal, { platform: 'darwin', arch: 'arm64', portable: false })?.name).toContain('universal')
    const intel = parseGitHubRelease(githubRelease('0.2.0', ['Stealth-Reader-0.2.0-x64.dmg']))
    expect(selectReleaseAsset(intel, { platform: 'darwin', arch: 'arm64', portable: false })).toBeNull()
  })

  it('does not pick a differently versioned or ambiguously named executable', () => {
    const wrong = parseGitHubRelease(githubRelease('0.2.0', ['Stealth-Reader-Setup-0.1.0-x64.exe', 'Setup.exe']))
    expect(selectReleaseAsset(wrong, { platform: 'win32', arch: 'x64', portable: false })).toBeNull()
  })

  it('disables unsupported systems and disables installation in development', () => {
    expect(initialUpdateState('0.1.1', { platform: 'linux', arch: 'x64', portable: false }, true).status).toBe('unsupported')
    expect(initialUpdateState('0.1.1', { platform: 'win32', arch: 'ia32', portable: false }, true).canInstall).toBe(false)
    expect(initialUpdateState('0.1.1', { platform: 'darwin', arch: 'arm64', portable: false }, false).canInstall).toBe(false)
  })
})

describe('release trust boundaries', () => {
  it('rejects drafts and prereleases even if returned as latest', () => {
    expect(() => parseGitHubRelease({ ...githubRelease(), draft: true })).toThrow()
    expect(() => parseGitHubRelease({ ...githubRelease(), prerelease: true })).toThrow()
  })

  it('rejects off-repository URLs, mismatched tag paths and oversized packages', () => {
    for (const patch of [
      { browser_download_url: 'https://example.org/installer.exe' },
      { browser_download_url: `${repo}/releases/download/v0.1.0/Stealth-Reader-0.2.0-arm64.dmg` },
      { size: 2 * 1024 ** 3 },
      { state: 'new' }
    ]) {
      const raw = githubRelease()
      expect(parseGitHubRelease({ ...raw, assets: [{ ...raw.assets[0], ...patch }] }).assets).toEqual([])
    }
  })

  it('leaves missing digests unavailable for in-app downloads', () => {
    const raw = githubRelease()
    const parsed = parseGitHubRelease({ ...raw, assets: [{ ...raw.assets[0], digest: null }] })
    expect(parsed.assets[0].sha256).toBeNull()
  })

  it('restricts every download redirect to HTTPS GitHub release hosts', () => {
    expect(() => assertDownloadUrl(`${repo}/releases/download/v0.2.0/a.dmg`, true)).not.toThrow()
    expect(() => assertDownloadUrl('https://release-assets.githubusercontent.com/a?token=temporary')).not.toThrow()
    for (const url of ['http://github.com/file', 'https://evil.example/file', 'https://github.com/other/repo/file', 'https://user:pass@release-assets.githubusercontent.com/a', 'https://release-assets.githubusercontent.com:444/a', 'file:///tmp/a']) {
      expect(() => assertDownloadUrl(url)).toThrow()
    }
    expect(() => assertDownloadUrl('https://release-assets.githubusercontent.com/a', true)).toThrow()
  })
})
