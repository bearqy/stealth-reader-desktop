import { spawn, execFile } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prepareMacUpdate } from '../src/main/mac-update'
import { MAC_UPDATE_HELPER } from '../src/main/mac-update-helper'

const command = promisify(execFile)
const identifier = 'com.stealthreader.update-transaction-test'
let root: string
let binary: string

async function bundle(path: string, version: string, noAck: boolean): Promise<void> {
  await mkdir(join(path, 'Contents/MacOS'), { recursive: true })
  await mkdir(join(path, 'Contents/Resources'), { recursive: true })
  await cp(binary, join(path, 'Contents/MacOS/Reader'))
  if (noAck) await writeFile(join(path, 'Contents/Resources/no-ack'), '')
  await writeFile(join(path, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${identifier}</string>
    <key>CFBundleExecutable</key><string>Reader</string><key>CFBundleName</key><string>Updater Test</string>
    <key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/>
    <key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string></dict></plist>`)
  await command('/usr/bin/codesign', ['--force', '--sign', '-', path])
}

async function scenario(name: string, noAck = false) {
  const base = join(root, name)
  await mkdir(base)
  const target = join(base, "Reader's $literal.app")
  const payload = join(base, 'payload')
  const profile = join(base, 'profile with spaces')
  await mkdir(payload)
  await mkdir(profile)
  await writeFile(join(profile, 'sentinel'), 'reader data stays intact')
  await bundle(target, '0.1.5', false)
  await bundle(join(payload, 'Stealth Reader.app'), '0.1.6', noAck)
  const dmg = join(base, 'update.dmg')
  await command('/usr/bin/hdiutil', ['create', '-srcfolder', payload, '-volname', 'Stealth Update Test', '-format', 'UDZO', dmg])
  const prepared = await prepareMacUpdate({ dmg, executablePath: join(target, 'Contents/MacOS/Reader'),
    userDataDirectory: profile, currentVersion: '0.1.5', version: '0.1.6', arch: process.arch, bundleIdentifier: identifier })
  const manifest = JSON.parse(await readFile(join(prepared.directory, 'manifest.json'), 'utf8'))
  return { base, target, profile, prepared, manifest }
}

async function runHelper(test: Awaited<ReturnType<typeof scenario>>, changeTarget = false) {
  const old = spawn('/bin/sleep', ['60']) // Only this test-owned process represents the old app.
  await new Promise<void>((resolve, reject) => { old.once('spawn', resolve); old.once('error', reject) })
  const identity = await lstat(test.target, { bigint: true })
  if (test.manifest && test.base.endsWith('rollback')) {
    // Shorten only this generated test worker's health deadline, not production code.
    await writeFile(join(test.prepared.directory, 'install.sh'), MAC_UPDATE_HELPER.replace('startup_attempts=225', 'startup_attempts=10'))
  }
  const child = spawn('/bin/sh', [join(test.prepared.directory, 'install.sh'), test.target, test.prepared.directory,
    String(old.pid), test.manifest.token, `${identity.dev}:${identity.ino}`, 'Reader', test.profile])
  let output = ''
  child.stderr.on('data', data => { output += data })
  const completed = new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject) })
  try {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      try { if (await readFile(join(test.prepared.directory, 'helper-ready'), 'utf8') === test.manifest.token) break } catch { /* starting */ }
      await delay(20)
    }
    expect(await readFile(join(test.prepared.directory, 'helper-ready'), 'utf8')).toBe(test.manifest.token)
    if (changeTarget) {
      await rename(test.target, join(test.base, 'user-saved-original.app'))
      await bundle(test.target, '0.1.5', false)
      await writeFile(join(test.target, 'user-change'), 'do not overwrite')
    }
    old.kill('SIGTERM')
    const code = await completed
    return { code, output, result: await readFile(join(test.prepared.directory, 'result'), 'utf8') }
  } finally {
    old.kill('SIGTERM')
    if (child.exitCode === null) child.kill('SIGTERM')
  }
}

describe.skipIf(process.platform !== 'darwin')('native macOS updater transactions (isolated signed fixtures only)', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'stealth-native-update-')))
    binary = join(root, 'Reader')
    await command('/usr/bin/clang', [resolve('tests/fixtures/mac-update-app.c'), '-o', binary])
  }, 30_000)
  afterAll(async () => { if (root) { await delay(200); await rm(root, { recursive: true, force: true }) } })

  it('validates a real DMG, replaces a quoted-path app and relaunches with the same user-data directory', async () => {
    const test = await scenario('success')
    const outcome = await runHelper(test)
    expect(outcome, outcome.output).toMatchObject({ code: 0, result: 'installed' })
    const version = await command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(test.target, 'Contents/Info.plist')])
    expect(version.stdout.trim()).toBe('0.1.6')
    expect(await readFile(join(test.prepared.directory, 'launch.args'), 'utf8')).toContain(`--user-data-dir=${test.profile}`)
    expect(await readFile(join(test.profile, 'sentinel'), 'utf8')).toBe('reader data stays intact')
    await command('/usr/bin/codesign', ['--verify', '--deep', '--strict', test.target])
  }, 60_000)

  it('terminates only the unconfirmed new instance and restores the previous app if startup fails', async () => {
    const test = await scenario('rollback', true)
    const outcome = await runHelper(test)
    expect(outcome, outcome.output).toMatchObject({ code: 1, result: 'failed:startup-not-confirmed' })
    const version = await command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(test.target, 'Contents/Info.plist')])
    expect(version.stdout.trim()).toBe('0.1.5')
    expect(await readFile(join(test.profile, 'sentinel'), 'utf8')).toBe('reader data stays intact')
    expect((await lstat(join(test.prepared.directory, 'failed.app'))).isDirectory()).toBe(true)
  }, 60_000)

  it('refuses to replace an app changed by another installer during preparation', async () => {
    const test = await scenario('changed')
    const outcome = await runHelper(test, true)
    expect(outcome, outcome.output).toMatchObject({ code: 1, result: 'failed:target-changed' })
    expect(await readFile(join(test.target, 'user-change'), 'utf8')).toBe('do not overwrite')
  }, 60_000)
})
