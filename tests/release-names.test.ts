import { createRequire } from 'node:module'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parseGitHubRelease, selectReleaseAsset } from '../src/main/update-policy'
import { githubRelease } from './update-fixtures'

const require = createRequire(import.meta.url)
const { legacyName, createUpdateAliases } = require('../scripts/create-update-aliases.cjs') as {
  legacyName: (name: string, version: string) => string | null
  createUpdateAliases: (directory: string, version: string) => Promise<string[]>
}
const config = require('../package.json').build

it('keeps builder filenames, update matching and compatibility aliases aligned', () => {
  const cases = [
    ['mac', 'arm64', 'dmg', 'darwin', false, 'StealthReader-0.2.0-macos-arm64.dmg', 'Stealth-Reader-0.2.0-arm64.dmg'],
    ['mac', 'x64', 'dmg', 'darwin', false, 'StealthReader-0.2.0-macos-x64.dmg', 'Stealth-Reader-0.2.0-x64.dmg'],
    ['nsis', 'x64', 'exe', 'win32', false, 'StealthReader-0.2.0-windows-x64-setup.exe', 'Stealth-Reader-Setup-0.2.0-x64.exe'],
    ['portable', 'x64', 'exe', 'win32', true, 'StealthReader-0.2.0-windows-x64-portable.exe', 'Stealth-Reader-Portable-0.2.0-x64.exe']
  ] as const
  for (const [key, arch, ext, platform, portable, canonical, alias] of cases) {
    expect(config[key].artifactName.replace('${version}', '0.2.0').replace('${arch}', arch).replace('${ext}', ext)).toBe(canonical)
    expect(legacyName(canonical, '0.2.0')).toBe(alias)
    expect(selectReleaseAsset(parseGitHubRelease(githubRelease('0.2.0', [canonical])), { platform, arch, portable })?.name).toBe(canonical)
    expect(selectReleaseAsset(parseGitHubRelease(githubRelease('0.2.0', [alias])), { platform, arch, portable })?.name).toBe(alias)
  }
})

it('creates byte-identical legacy update aliases without changing the standard installers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stealth-release-names-'))
  try {
    const name = 'StealthReader-0.2.0-windows-x64-setup.exe'
    const bytes = Buffer.from('test installer bytes')
    await writeFile(join(directory, name), bytes)
    await writeFile(join(directory, 'unrelated.txt'), 'keep')
    const aliases = await createUpdateAliases(directory, '0.2.0')
    expect(aliases).toEqual(['Stealth-Reader-Setup-0.2.0-x64.exe'])
    expect(await readFile(join(directory, 'update-compat', aliases[0]))).toEqual(bytes)
    expect(await readFile(join(directory, name))).toEqual(bytes)
    expect(await readdir(directory)).toContain('unrelated.txt')
    expect(legacyName('../StealthReader-0.2.0-windows-x64-setup.exe', '0.2.0')).toBeNull()
    expect(legacyName(name, '0.1.2')).toBeNull()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
