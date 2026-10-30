// End-to-end update of two isolated Electron app fixtures. Never uses /Applications
// or the normal user profile. Requires `npm run build` and a native macOS host.
const assert = require('node:assert/strict')
const { execFileSync, spawn } = require('node:child_process')
const { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, cpSync, statSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { createPackage } = require('@electron/asar')
const { buildSync } = require('esbuild')
const Module = require('node:module')

assert.equal(process.platform, 'darwin', 'This check requires native macOS')
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stealth-self-update-e2e-')))
const repo = resolve(__dirname, '..')
const packageJson = require('../package.json')
const version = packageJson.version
const identifier = 'com.stealthreader.electron-update-fixture'
const executable = 'ReaderQA'
const profile = join(root, 'isolated user profile')
const target = join(root, "Reader's $literal.app")
const payload = join(root, 'payload')
const updated = join(payload, 'Stealth Reader.app')
const runtime = join(repo, 'node_modules/electron/dist/Electron.app')
let previousProcess
let helper
let newPid
let transaction

function command(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] })
}
async function appBundle(destination, appVersion) {
  // APFS clones keep this test's disk use small and preserve framework symlinks.
  try { command('/bin/cp', ['-cR', runtime, destination]) }
  catch { command('/usr/bin/ditto', [runtime, destination]) }
  command('/bin/mv', [join(destination, 'Contents/MacOS/Electron'), join(destination, 'Contents/MacOS', executable)])
  const source = join(root, `source-${appVersion}`)
  mkdirSync(source)
  cpSync(join(repo, 'out'), join(source, 'out'), { recursive: true })
  writeFileSync(join(source, 'package.json'), JSON.stringify({ ...packageJson, version: appVersion }))
  await createPackage(source, join(destination, 'Contents/Resources/app.asar'))
  for (const [key, value] of [['CFBundleIdentifier', identifier], ['CFBundleExecutable', executable], ['CFBundleShortVersionString', appVersion],
    ['CFBundleVersion', appVersion], ['CFBundleName', 'Stealth Reader Update QA']]) {
    command('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, join(destination, 'Contents/Info.plist')])
  }
  command('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', destination])
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', destination])
}

async function main() {
  mkdirSync(payload)
  mkdirSync(profile)
  const textFile = join(root, 'book.txt')
  writeFileSync(textFile, '第一章 测试\n只用于隔离更新测试。')
  writeFileSync(join(profile, 'local-state.json'), JSON.stringify({ version: 2,
    settings: { readerFontSize: 23, readerFontFamily: 'serif', readerLetterSpacing: 0.06,
      readerLineHeight: 2.2, readerTheme: 'green', bossShortcut: 'CommandOrControl+Alt+Shift+9', checkUpdatesOnLaunch: false },
    library: [{ id: 'qa-book', title: '隔离测试', fileName: 'book.txt', filePath: textFile,
      progress: 0.42, readerPosition: { chapterStart: 0, chapterProgress: 0.42 }, lastOpenedAt: '' }] }))
  console.log('Preparing two signed Electron app fixtures in a private temporary directory…')
  await appBundle(target, '0.0.0')
  await appBundle(updated, version)
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_RENDERER_URL
  previousProcess = spawn(join(target, 'Contents/MacOS', executable), [`--user-data-dir=${profile}`],
    { env: environment, stdio: ['ignore', 'ignore', 'pipe'] })
  previousProcess.stderr.on('data', () => {})
  await new Promise((resolve, reject) => { previousProcess.once('spawn', resolve); previousProcess.once('error', reject) })
  await delay(2000)
  assert.equal(previousProcess.exitCode, null, 'Old test app failed to launch')
  const dmg = join(root, 'update.dmg')
  command('/usr/bin/hdiutil', ['create', '-srcfolder', payload, '-volname', 'Stealth Update QA', '-format', 'UDZO', dmg])
  const compiled = buildSync({ entryPoints: [join(repo, 'src/main/mac-update.ts')], bundle: true,
    platform: 'node', format: 'cjs', write: false }).outputFiles[0].text
  const loaded = new Module(join(repo, 'mac-update-qa.cjs'), module)
  loaded.filename = join(repo, 'mac-update-qa.cjs')
  loaded.paths = module.paths
  loaded._compile(compiled, loaded.filename)
  const prepared = await loaded.exports.prepareMacUpdate({ dmg, executablePath: join(target, 'Contents/MacOS', executable),
    currentVersion: '0.0.0', version, arch: process.arch, userDataDirectory: profile, bundleIdentifier: identifier })
  transaction = prepared.directory
  const manifest = JSON.parse(readFileSync(join(transaction, 'manifest.json'), 'utf8'))
  const identity = statSync(target, { bigint: true })
  let helperOutput = ''
  helper = spawn('/bin/sh', [join(transaction, 'install.sh'), target, transaction, String(previousProcess.pid),
    manifest.token, `${identity.dev}:${identity.ino}`, executable, profile], { env: environment })
  helper.stderr.on('data', data => { helperOutput += data })
  helper.stdout.on('data', () => {})
  const deadline = Date.now() + 55_000
  while (Date.now() < deadline) {
    try { if (readFileSync(join(transaction, 'helper-ready'), 'utf8') === manifest.token) break } catch { /* starting */ }
    await delay(50)
  }
  assert.equal(readFileSync(join(transaction, 'helper-ready'), 'utf8'), manifest.token)
  previousProcess.kill('SIGTERM')
  let result = ''
  while (Date.now() < deadline) {
    try { result = readFileSync(join(transaction, 'result'), 'utf8') } catch { /* installing */ }
    if (result) break
    await delay(100)
  }
  try { newPid = Number(readFileSync(join(transaction, 'new.pid'), 'utf8')) } catch { /* launch failed */ }
  assert.equal(result, 'installed', `Update did not complete: ${result}\n${helperOutput}`)
  assert.equal(readFileSync(join(transaction, 'app-ready'), 'utf8'), manifest.token,
    'The actual React/preload startup handshake did not complete')
  const state = JSON.parse(readFileSync(join(profile, 'local-state.json'), 'utf8'))
  assert.equal(state.settings.readerFontSize, 23)
  assert.equal(state.settings.readerFontFamily, 'serif')
  assert.equal(state.settings.readerLetterSpacing, 0.06)
  assert.equal(state.settings.readerTheme, 'green')
  assert.equal(state.library[0].progress, 0.42)
  assert.equal(state.library[0].readerPosition.chapterProgress, 0.42)
  assert.equal(readFileSync(textFile, 'utf8'), '第一章 测试\n只用于隔离更新测试。')
  assert.equal(command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(target, 'Contents/Info.plist')]).trim(), version)
  command('/usr/bin/codesign', ['--verify', '--deep', '--strict', target])
  assert.ok(newPid > 1)
  process.kill(newPid, 0)
  console.log(`PASS: actual Electron app updated 0.0.0 → ${version}, restarted, rendered React UI and acknowledged readiness.`)
  console.log('PASS: font settings, library, chapter bookmark and original TXT retained in the same isolated user profile.')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  // Only processes started by this test, with executable paths inside its own root.
  if (previousProcess?.exitCode === null) previousProcess.kill('SIGTERM')
  if (newPid > 1) {
    try {
      const args = command('/bin/ps', ['-p', String(newPid), '-o', 'command='])
      if (args.startsWith(join(target, 'Contents/MacOS', executable))) process.kill(newPid, 'SIGTERM')
    } catch { /* Already exited. */ }
  }
  if (helper?.exitCode === null) {
    await delay(500)
    if (helper.exitCode === null) helper.kill('SIGTERM')
  }
  // Also cover a deliberately broken fixture that never registered its PID.
  // The exact mkdtemp root, not an app name or a broad process pattern, is the boundary.
  for (const line of command('/bin/ps', ['-axo', 'pid=,command=']).split('\n')) {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line)
    if (match && match[2].startsWith(root + '/') && match[2].includes('/Contents/')) {
      try { process.kill(Number(match[1]), 'SIGTERM') } catch { /* Already exited. */ }
    }
  }
  await delay(1000)
  if (process.env.KEEP_MAC_UPDATE_TEST === '1') console.log('Retained isolated QA files:', root)
  else rmSync(root, { recursive: true, force: true })
})
