// Test the final distributable, not the development Electron runtime.
// Ad-hoc signing provides integrity, NOT Developer ID trust or notarization.
const assert = require('node:assert/strict')
const { execFileSync, spawn } = require('node:child_process')
const { mkdtempSync, mkdirSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

function command(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Debugger connection timed out')), 10_000)
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Debugger connection failed')) }, { once: true })
  })
  let nextId = 0
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        const finish = (error, result) => {
          clearTimeout(timeout)
          socket.removeEventListener('message', onMessage)
          if (error) reject(error)
          else resolve(result)
        }
        const onMessage = (event) => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          finish(message.error ? new Error(JSON.stringify(message.error)) : null, message.result)
        }
        const timeout = setTimeout(() => finish(new Error(`${method} timed out`)), 10_000)
        socket.addEventListener('message', onMessage)
        socket.send(JSON.stringify({ id, method, params }))
      })
    }
  }
}

async function verify(dmg) {
  assert.equal(process.platform, 'darwin', 'This check requires macOS')
  const temporary = mkdtempSync(join(tmpdir(), 'stealth-dmg-smoke-'))
  const mount = join(temporary, 'mount')
  const app = join(temporary, 'Stealth Reader.app')
  let mounted = false
  let child
  let renderer
  let stderr = ''
  try {
    command('hdiutil', ['verify', dmg])
    mkdirSync(mount)
    command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg])
    mounted = true
    // Copy as a user would install it. Do not clear quarantine or disable Gatekeeper.
    command('ditto', [join(mount, 'Stealth Reader.app'), app])
    command('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])
    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    delete environment.ELECTRON_RENDERER_URL
    child = spawn(join(app, 'Contents/MacOS/Stealth Reader'), [
      `--user-data-dir=${join(temporary, 'profile')}`,
      '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'
    ], { env: environment, stdio: ['ignore', 'ignore', 'pipe'] })
    let spawnError
    child.on('error', (error) => { spawnError = error })
    child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-30_000) })
    const deadline = Date.now() + 45_000
    let browserUrl
    let target
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      assert(child.exitCode === null && child.signalCode === null, `Packaged app exited early: ${stderr}`)
      browserUrl = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)?.[1]
      if (browserUrl) {
        const port = new URL(browserUrl).port
        try {
          const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })).json()
          target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:') && item.url.includes('app.asar/out/renderer/index.html'))
          if (target) break
        } catch { /* Startup may not have created the renderer yet. */ }
      }
      await delay(250)
    }
    assert(target, `Packaged renderer did not start: ${stderr}`)
    renderer = await connect(target.webSocketDebuggerUrl)
    let ready = false
    while (Date.now() < deadline) {
      const response = await renderer.send('Runtime.evaluate', {
        expression: `(async () => {
          if (!window.stealthReader || !document.querySelector('#root')?.children.length) return false;
          const state = await window.stealthReader.bootstrap();
          return Boolean(state.settings && state.library && state.browser && state.updates
            && document.body.innerText.includes('阅读'));
        })()`,
        awaitPromise: true, returnByValue: true
      })
      if (response.result?.value === true) { ready = true; break }
      await delay(250)
    }
    assert(ready, 'Packaged UI or preload/bootstrap IPC did not load')
    // Also catch renderer/helper crashes immediately after the first frame.
    await delay(2000)
    const alive = await renderer.send('Runtime.evaluate', { expression: 'document.querySelector("#root").children.length > 0', returnByValue: true })
    assert.equal(alive.result.value, true)
    // Electron's browser-level Browser.close is not a reliable app.quit API on macOS.
    // Terminate only the spawned test process, never another installed/running copy.
    child.kill('SIGTERM')
    const exitDeadline = Date.now() + 10_000
    while (child.exitCode === null && child.signalCode === null && Date.now() < exitDeadline) await delay(100)
    assert(child.exitCode === 0 || child.signalCode === 'SIGTERM', 'Test application did not terminate')
    console.log(`PASS ${dmg}: DMG checksum, deep/strict signature, installed app startup, rendered UI and preload IPC`)
    console.log('Ad-hoc only: Gatekeeper trust/notarization is not claimed; first launch may need manual Open Anyway.')
  } finally {
    renderer?.close()
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      await delay(1000)
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
    if (mounted) command('hdiutil', ['detach', mount])
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (require.main === module) {
  const { version } = require('../package.json')
  const dmg = process.argv[2] || `release/StealthReader-${version}-macos-${process.arch}.dmg`
  verify(resolve(dmg)).catch((error) => { console.error(error); process.exitCode = 1 })
}
