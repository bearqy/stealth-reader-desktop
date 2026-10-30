import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmMacUpdateStartup, installedMacAppPath, macUpdateFailure, prepareMacUpdate, registerMacUpdateProcess, type MacUpdateCommand } from '../src/main/mac-update'
import { MAC_UPDATE_HELPER } from '../src/main/mac-update-helper'

const directories: string[] = []
async function directory(): Promise<string> {
  const path = await realpath(await mkdtemp(join(tmpdir(), 'stealth-mac-update-test-')))
  directories.push(path)
  return path
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture() {
  const root = await directory()
  const target = join(root, "Reader's $literal.app")
  const source = join(root, 'source.app')
  for (const path of [target, source]) {
    await mkdir(join(path, 'Contents/MacOS'), { recursive: true })
    await writeFile(join(path, 'Contents/Info.plist'), 'fixture')
    await writeFile(join(path, 'Contents/MacOS/Reader'), 'not executed')
  }
  const executablePath = join(target, 'Contents/MacOS/Reader')
  const token = randomUUID()
  const work = join(root, `.stealth-reader-update-${token}`)
  const manifest = { format: 1, token, target, currentVersion: '0.1.5', version: '0.1.6', executable: 'Reader',
    userDataDirectory: join(root, 'profile') }
  return { root, target, source, executablePath, token, work, manifest }
}

describe('mac update paths and handshake', () => {
  it('derives only a real app-shaped executable path, preserving spaces and quotes literally', () => {
    const target = resolve(tmpdir(), "Reader's $literal.app")
    expect(installedMacAppPath(join(target, 'Contents/MacOS/Reader'))).toBe(target)
    expect(() => installedMacAppPath('/usr/local/bin/reader')).toThrow()
    expect(() => installedMacAppPath('/Applications/Reader.app/Contents/MacOS/a\nb')).toThrow()
  })

  it('does not acknowledge unrelated/stale or path-bearing startup tokens', async () => {
    const test = await fixture()
    await confirmMacUpdateStartup(test.executablePath, ['--stealth-update-token=../../other'], '0.1.6')
    expect(await readdir(test.root)).toEqual(expect.arrayContaining(["Reader's $literal.app", 'source.app']))
    await mkdir(test.work)
    await writeFile(join(test.work, 'manifest.json'), JSON.stringify(test.manifest))
    await confirmMacUpdateStartup(test.executablePath, [`--stealth-update-token=${test.token}`], '0.1.7')
    expect(await readdir(test.work)).toEqual(['manifest.json'])
    await writeFile(join(test.work, 'manifest.json'), JSON.stringify({ ...test.manifest, target: '/Applications/other.app' }))
    await confirmMacUpdateStartup(test.executablePath, [`--stealth-update-token=${test.token}`], '0.1.6')
    expect(await readdir(test.work)).toEqual(['manifest.json'])
  })

  it('acknowledges only the expected new version and records only this process', async () => {
    const test = await fixture()
    await mkdir(test.work)
    await writeFile(join(test.work, 'manifest.json'), JSON.stringify(test.manifest))
    const args = [`--stealth-update-token=${test.token}`]
    await registerMacUpdateProcess(test.executablePath, args, '0.1.6')
    await confirmMacUpdateStartup(test.executablePath, args, '0.1.6')
    expect(await readFile(join(test.work, 'new.pid'), 'utf8')).toBe(String(process.pid))
    expect(await readFile(join(test.work, 'app-ready'), 'utf8')).toBe(test.token)
  })

  it('reports a rollback only to the restored version of this application', async () => {
    const test = await fixture()
    await mkdir(test.work)
    await writeFile(join(test.work, 'manifest.json'), JSON.stringify(test.manifest))
    await writeFile(join(test.work, 'result'), 'failed:startup-not-confirmed')
    expect(await macUpdateFailure(test.executablePath, [`--stealth-update-failed=${test.token}`], '0.1.5')).toContain('已恢复原版本')
    expect(await macUpdateFailure(test.executablePath, [`--stealth-update-failed=${test.token}`], '0.1.6')).toBeNull()
  })

  it('does not contain quarantine removal or system security overrides', () => {
    expect(MAC_UPDATE_HELPER).not.toMatch(/xattr|spctl|sudo|administrator privileges/)
    expect(MAC_UPDATE_HELPER).toContain('/usr/bin/open -n "$target"')
    expect(MAC_UPDATE_HELPER).toContain('"$work" = "$parent/.stealth-reader-update-$token"')
  })
})

describe.skipIf(process.platform !== 'darwin')('Mac preparation (mocked system commands, real private directories)', () => {
  async function prepareFixture(overrides: { version?: string; arch?: string; team?: string; identifier?: string; badSignature?: boolean } = {}) {
    const test = await fixture()
    const run: MacUpdateCommand = vi.fn(async (file, args) => {
      if (file.endsWith('hdiutil') && args[0] === 'attach') {
        const mount = args[args.indexOf('-mountpoint') + 1]
        await cp(test.source, join(mount, 'Stealth Reader.app'), { recursive: true })
      }
      if (file.endsWith('ditto')) await cp(args[0], args[1], { recursive: true })
      if (file.endsWith('codesign') && args[0] === '--verify' && overrides.badSignature) throw new Error('bad signature')
      if (file.endsWith('codesign') && args[0] === '-d') {
        return { stdout: '', stderr: `TeamIdentifier=${args.at(-1) === test.target ? 'TEAM' : overrides.team ?? 'TEAM'}` }
      }
      if (file.endsWith('lipo')) return { stdout: overrides.arch ?? 'arm64 x86_64', stderr: '' }
      if (file.endsWith('PlistBuddy')) {
        const staged = !args.at(-1)!.startsWith(test.target + '/')
        const values: Record<string, string> = { 'Print :CFBundleIdentifier': staged ? overrides.identifier ?? 'com.stealthreader.desktop' : 'com.stealthreader.desktop',
          'Print :CFBundleShortVersionString': staged ? overrides.version ?? '0.1.6' : '0.1.5', 'Print :CFBundleExecutable': 'Reader' }
        return { stdout: values[args[1]] ?? '', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })
    const options = { dmg: join(test.root, 'update.dmg'), executablePath: test.executablePath,
      currentVersion: '0.1.5', version: '0.1.6', arch: process.arch,
      userDataDirectory: join(test.root, 'profile'), run }
    return { ...test, run, options }
  }

  it('stages beside the app, detaches the image and leaves the installed app untouched', async () => {
    const test = await prepareFixture()
    const prepared = await prepareMacUpdate(test.options)
    expect(dirname(prepared.directory)).toBe(test.root)
    expect((await lstat(prepared.directory)).mode & 0o777).toBe(0o700)
    expect(await readFile(join(test.target, 'Contents/Info.plist'), 'utf8')).toBe('fixture')
    expect(test.run).toHaveBeenCalledWith('/usr/bin/hdiutil', ['detach', join(prepared.directory, 'mount')])
    expect(await readFile(join(prepared.directory, 'install.sh'), 'utf8')).toContain('startup-not-confirmed')
    await prepared.discard()
    expect(await readdir(test.root)).not.toContain(prepared.directory.split('/').at(-1))
  })

  it.each([{ version: '0.9.9' }, { arch: 'unsupported' }, { identifier: 'another.app' }, { team: 'OTHER' }, { badSignature: true }])(
    'rejects mismatched metadata/signatures without replacing the current app: %j', async (overrides) => {
      const test = await prepareFixture(overrides)
      await expect(prepareMacUpdate(test.options)).rejects.toThrow()
      expect(await readFile(join(test.target, 'Contents/MacOS/Reader'), 'utf8')).toBe('not executed')
      expect((await readdir(test.root)).filter(name => name.startsWith('.stealth-reader-update-'))).toEqual([])
    })

  it('rejects app bundle aliases and downgrades before preparing a transaction', async () => {
    const test = await prepareFixture()
    await expect(prepareMacUpdate({ ...test.options, version: '0.1.5' })).rejects.toThrow('相同或更旧')
    const alias = join(test.root, 'alias.app')
    await symlink(test.target, alias)
    await expect(prepareMacUpdate({ ...test.options, executablePath: join(alias, 'Contents/MacOS/Reader') })).rejects.toThrow()
    expect(test.run).not.toHaveBeenCalled()
  })
})
