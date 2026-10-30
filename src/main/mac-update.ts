import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, lstat, mkdir, readFile, realpath, rm, writeFile, open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { MAC_UPDATE_HELPER } from './mac-update-helper'
import { isNewerVersion, stableVersion } from './update-policy'

const execute = promisify(execFile)
const APP_ID = 'com.stealthreader.desktop'
const TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
type CommandResult = { stdout: string; stderr: string }
export type MacUpdateCommand = (file: string, args: string[]) => Promise<CommandResult>
const command: MacUpdateCommand = async (file, args) => execute(file, args, {
  encoding: 'utf8', timeout: 120_000, maxBuffer: 1024 * 1024
})

interface MacUpdateManifest {
  format: 1
  token: string
  target: string
  currentVersion: string
  version: string
  executable: string
  userDataDirectory: string
}

export interface PreparedMacUpdate {
  directory: string
  launch: () => Promise<void>
  discard: () => Promise<void>
}

async function regularDirectory(path: string): Promise<void> {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('更新目录无效或使用了符号链接，请手动安装。')
}

export function installedMacAppPath(executablePath: string): string {
  if (/[\r\n\0]/.test(executablePath)) throw new Error('应用安装路径无效。')
  const target = resolve(dirname(executablePath), '../..')
  if (!target.endsWith('.app') || dirname(executablePath) !== join(target, 'Contents', 'MacOS')) {
    throw new Error('无法确定当前 Mac 应用位置，请先正常安装应用。')
  }
  return target
}

async function plist(bundle: string, key: string, run: MacUpdateCommand): Promise<string> {
  const file = join(bundle, 'Contents/Info.plist')
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || await realpath(file) !== file) throw new Error('应用信息文件路径无效。')
  return (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file])).stdout.trim()
}

function team(result: CommandResult): string | null {
  const value = /^TeamIdentifier=(.+)$/m.exec(result.stdout + '\n' + result.stderr)?.[1]?.trim()
  return value && value !== 'not set' ? value : null
}

export async function prepareMacUpdate(options: {
  dmg: string; executablePath: string; currentVersion: string; version: string; arch: string
  userDataDirectory: string
  bundleIdentifier?: string; run?: MacUpdateCommand
}): Promise<PreparedMacUpdate> {
  if (process.platform !== 'darwin') throw new Error('此安装流程仅支持 macOS。')
  if (!stableVersion(options.version) || !isNewerVersion(options.version, options.currentVersion)) {
    throw new Error('拒绝安装相同或更旧的版本。')
  }
  if (!['arm64', 'x64'].includes(options.arch)) throw new Error('当前 Mac 架构暂不支持自动安装。')
  if (!isAbsolute(options.userDataDirectory) || /[\r\n\0]/.test(options.userDataDirectory)) throw new Error('用户数据目录无效。')
  const run = options.run ?? command
  const identifier = options.bundleIdentifier ?? APP_ID
  const target = installedMacAppPath(options.executablePath)
  await regularDirectory(target)
  if (await realpath(target) !== target || await realpath(options.executablePath) !== options.executablePath) {
    throw new Error('当前应用使用了链接路径，请先正常安装应用。')
  }
  if (target.startsWith('/Volumes/') || target.includes('/AppTranslocation/')) {
    throw new Error('当前正在磁盘映像或临时隔离目录中运行，请先安装到“应用程序”再使用自动更新。')
  }
  try {
    await access(dirname(target), constants.W_OK)
    await access(target, constants.W_OK)
  } catch {
    throw new Error('当前应用目录不可写，请使用可写的应用程序目录安装；不会自动索取管理员密码。')
  }
  if (await plist(target, 'CFBundleIdentifier', run) !== identifier
    || await plist(target, 'CFBundleShortVersionString', run) !== options.currentVersion) {
    throw new Error('当前应用标识或版本不符，已停止自动更新。')
  }
  const original = await lstat(target, { bigint: true })
  const identity = `${original.dev}:${original.ino}`
  const token = randomUUID()
  const directory = join(dirname(target), `.stealth-reader-update-${token}`)
  await mkdir(directory, { mode: 0o700 })
  const mount = join(directory, 'mount')
  const staged = join(directory, 'next.app')
  let mounted = false
  try {
    await mkdir(mount)
    await run('/usr/bin/hdiutil', ['verify', options.dmg])
    mounted = true
    await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, options.dmg])
    const source = join(mount, 'Stealth Reader.app')
    await regularDirectory(source)
    await run('/usr/bin/ditto', [source, staged])
    await regularDirectory(staged)
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged])
    if (await plist(staged, 'CFBundleIdentifier', run) !== identifier
      || await plist(staged, 'CFBundleShortVersionString', run) !== options.version) {
      throw new Error('安装包中的应用标识或版本与发布信息不符。')
    }
    const executable = await plist(staged, 'CFBundleExecutable', run)
    if (!/^[a-z0-9][a-z0-9 ._-]{0,80}$/i.test(executable)) throw new Error('新应用的可执行文件名无效。')
    if (executable !== basename(options.executablePath)) throw new Error('新版可执行文件名称与当前应用不符，请手动安装。')
    const binary = join(staged, 'Contents/MacOS', executable)
    const binaryInfo = await lstat(binary)
    if (!binaryInfo.isFile() || binaryInfo.isSymbolicLink()) throw new Error('新应用的可执行文件无效。')
    const arch = options.arch === 'x64' ? 'x86_64' : 'arm64'
    const architectures = (await run('/usr/bin/lipo', ['-archs', binary])).stdout.trim().split(/\s+/)
    if (!architectures.includes(arch)) throw new Error('新应用的架构与本机不匹配。')
    const oldTeam = team(await run('/usr/bin/codesign', ['-d', '--verbose=4', target]))
    const newTeam = team(await run('/usr/bin/codesign', ['-d', '--verbose=4', staged]))
    if (oldTeam && oldTeam !== newTeam) throw new Error('新应用的签名团队与当前应用不一致。')
    const manifest: MacUpdateManifest = { format: 1, token, target, currentVersion: options.currentVersion,
      version: options.version, executable, userDataDirectory: options.userDataDirectory }
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx', mode: 0o600 })
    const helper = join(directory, 'install.sh')
    await writeFile(helper, MAC_UPDATE_HELPER, { flag: 'wx', mode: 0o700 })
    await run('/usr/bin/hdiutil', ['detach', mount])
    mounted = false
    let launched = false
    return {
      directory,
      discard: async () => {
        if (!launched) await rm(directory, { recursive: true, force: true })
      },
      launch: async () => {
        if (launched) throw new Error('更新安装程序已经启动。')
        const current = await lstat(target, { bigint: true })
        if (`${current.dev}:${current.ino}` !== identity) throw new Error('应用在准备更新期间发生变化，请重新检查更新。')
        const log = await open(join(directory, 'install.log'), 'ax', 0o600)
        try {
          const child = spawn('/bin/sh', [helper, target, directory, String(process.pid), token, identity, executable, options.userDataDirectory], {
            detached: true, cwd: directory, stdio: ['ignore', log.fd, log.fd]
          })
          let spawnError: Error | null = null
          child.once('error', (error) => { spawnError = error })
          const deadline = Date.now() + 5000
          while (Date.now() < deadline) {
            if (spawnError) throw spawnError
            try {
              if (await readFile(join(directory, 'helper-ready'), 'utf8') === token) {
                launched = true
                child.unref()
                return
              }
            } catch { /* The worker may still be starting. */ }
            if (child.exitCode !== null) throw new Error('更新安装程序启动失败，请重试。')
            await delay(50)
          }
          child.kill('SIGTERM')
          throw new Error('更新安装程序没有响应，当前应用未退出。')
        } finally { await log.close() }
      }
    }
  } catch (error) {
    if (mounted) {
      try { await run('/usr/bin/hdiutil', ['detach', mount]); mounted = false } catch { /* Never delete a mounted volume. */ }
    }
    if (!mounted) await rm(directory, { recursive: true, force: true })
    throw error
  }
}

// A restart can only acknowledge a transaction beside the running app, with a
// matching token, destination and version. CLI arguments cannot choose file paths.
async function startupTransaction(executablePath: string, argv: string[], version: string, failed = false): Promise<{
  directory: string; manifest: MacUpdateManifest
} | null> {
  const prefix = failed ? '--stealth-update-failed=' : '--stealth-update-token='
  const token = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
  if (!token || !TOKEN.test(token)) return null
  const target = installedMacAppPath(executablePath)
  const directory = join(dirname(target), `.stealth-reader-update-${token}`)
  await regularDirectory(directory)
  if (await realpath(directory) !== directory || await realpath(target) !== target) return null
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as MacUpdateManifest
  if (manifest.format !== 1 || manifest.token !== token || manifest.target !== target
    || (failed ? manifest.currentVersion : manifest.version) !== version) return null
  return { directory, manifest }
}

export async function registerMacUpdateProcess(executablePath: string, argv: string[], version: string): Promise<void> {
  try {
    const transaction = await startupTransaction(executablePath, argv, version)
    if (transaction) await writeFile(join(transaction.directory, 'new.pid'), String(process.pid), { flag: 'wx', mode: 0o600 })
  } catch { /* A forged/stale startup argument must not prevent normal application startup. */ }
}

export async function confirmMacUpdateStartup(executablePath: string, argv: string[], version: string): Promise<void> {
  const transaction = await startupTransaction(executablePath, argv, version)
  if (!transaction) return
  await writeFile(join(transaction.directory, 'app-ready'), transaction.manifest.token, { flag: 'wx', mode: 0o600 })
}

export async function macUpdateFailure(executablePath: string, argv: string[], version: string): Promise<string | null> {
  try {
    const transaction = await startupTransaction(executablePath, argv, version, true)
    if (!transaction) return null
    const result = await readFile(join(transaction.directory, 'result'), 'utf8')
    return result.startsWith('failed:') ? '自动更新未能完成，已恢复原版本。请重试或前往 GitHub Releases 手动安装。' : null
  } catch { return null }
}
