import type { UpdateState } from '../shared/contracts'
import { downloadUpdateFile, verifyUpdateFile, type UpdateFetch } from './update-download'
import type { BackgroundCheckResult } from './update-scheduler'
import {
  initialUpdateState,
  isNewerVersion,
  LATEST_RELEASE_API,
  parseGitHubRelease,
  RELEASES_URL,
  selectReleaseAsset,
  type ParsedRelease,
  type ReleaseAsset,
  type UpdateTarget
} from './update-policy'

interface UpdateManagerOptions {
  version: string
  target: UpdateTarget
  packaged: boolean
  cacheDirectory: string
  fetch: UpdateFetch
  onState: (state: UpdateState) => void
  openInstaller: (file: string, portable: boolean, version: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
}

interface CheckContext {
  interactive: boolean
  controller: AbortController
  cancelled: boolean
  result: BackgroundCheckResult
}

export class UpdateManager {
  private state: UpdateState
  private release: ParsedRelease | null = null
  private asset: ReleaseAsset | null = null
  private downloadedPath: string | null = null
  private operation: Promise<UpdateState> | null = null
  private activeCheck: { context: CheckContext; state: Promise<UpdateState> } | null = null
  private abort: AbortController | null = null
  private cancelRequested = false

  constructor(private readonly options: UpdateManagerOptions) {
    this.state = initialUpdateState(options.version, options.target, options.packaged)
  }

  getState(): UpdateState {
    return structuredClone(this.state)
  }

  private setState(patch: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...patch }
    const state = this.getState()
    this.options.onState(state)
    return state
  }

  check(): Promise<UpdateState> {
    if (this.operation) return this.operation
    const running = this.activeCheck
    if (running && !running.context.cancelled) {
      if (!running.context.interactive) {
        running.context.interactive = true
        this.showChecking()
      }
      return running.state
    }
    return this.canCheck() ? this.startCheck(true).state : Promise.resolve(this.getState())
  }

  async checkInBackground(): Promise<BackgroundCheckResult> {
    if (!this.canCheck()) return 'deferred'
    const request = this.activeCheck ?? this.startCheck(false)
    await request.state
    return request.context.result
  }

  cancelBackgroundCheck(): void {
    const context = this.activeCheck?.context
    if (context && !context.interactive) {
      context.cancelled = true
      context.controller.abort()
    }
  }

  private canCheck(): boolean {
    return Boolean(this.state.packageType) && !this.operation &&
      !['downloaded', 'installing'].includes(this.state.status)
  }

  private startCheck(interactive: boolean): NonNullable<UpdateManager['activeCheck']> {
    const context: CheckContext = { interactive, controller: new AbortController(), cancelled: false, result: 'failed' }
    const state = this.checkRelease(context).finally(() => {
      if (this.activeCheck?.context === context) this.activeCheck = null
    })
    const request = { context, state }
    this.activeCheck = request
    return request
  }

  private showChecking(): void {
    this.release = null
    this.asset = null
    this.setState({ status: 'checking', message: '正在连接 GitHub Releases…', progress: null, latest: null })
  }

  private async checkRelease(context: CheckContext): Promise<UpdateState> {
    if (context.interactive) this.showChecking()
    const { controller } = context
    const timer = setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await this.options.fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Stealth-Reader-Updater' },
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error'
      })
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求受限，请稍后重试')
        if (response.status === 404) throw new Error('暂未找到公开的正式 Release，请稍后重试')
        throw new Error(`检查版本失败（HTTP ${response.status}）`)
      }
      const release = parseGitHubRelease(await response.json())
      controller.signal.throwIfAborted()
      const asset = selectReleaseAsset(release, this.options.target)
      const newer = isNewerVersion(release.version, this.state.currentVersion)
      this.release = release
      this.asset = asset
      context.result = 'success'
      const latest = {
        version: this.release.version, title: this.release.title, notes: this.release.notes,
        publishedAt: this.release.publishedAt, assetName: this.asset?.name ?? null,
        size: this.asset?.size ?? null
      }
      const checkedAt = new Date().toISOString()
      if (!newer) {
        return this.setState({ status: 'up-to-date', latest, checkedAt, message: '当前已是最新版本。' })
      }
      if (!this.asset || !this.asset.sha256) {
        return this.setState({ status: 'unsupported', latest, checkedAt,
          message: this.asset
            ? '新版安装包缺少 SHA-256 校验信息，请前往发布页面查看。'
            : `发现 v${latest.version}，但该版本尚未上传适用于本机的安装包。` })
      }
      return this.setState({ status: 'available', latest, checkedAt, message: `发现新版本 v${latest.version}。` })
    } catch (error) {
      if (context.cancelled) context.result = 'deferred'
      if (!context.interactive) return this.getState()
      this.asset = null
      return this.setState({ status: 'error', message: error instanceof Error && !controller.signal.aborted &&
        !['TypeError', 'FetchError'].includes(error.name)
        ? error.message : '无法连接 GitHub，请检查网络后重试。' })
    } finally {
      clearTimeout(timer)
    }
  }

  download(): Promise<UpdateState> {
    if (this.operation) return this.operation
    if (this.activeCheck?.context.interactive) return this.activeCheck.state
    if (!this.asset?.sha256 || !['available', 'error'].includes(this.state.status)) {
      return Promise.resolve(this.getState())
    }
    // Download the already-known offer immediately, without waiting on a background probe.
    this.cancelBackgroundCheck()
    const operation = this.downloadRelease()
    this.operation = operation
    void operation.finally(() => { this.operation = null })
    return operation
  }

  private async downloadRelease(): Promise<UpdateState> {
    const asset = this.asset!
    this.abort = new AbortController()
    this.cancelRequested = false
    const timer = setTimeout(() => this.abort?.abort(), 30 * 60_000)
    this.setState({ status: 'downloading', progress: { received: 0, total: asset.size, percent: 0 }, message: '正在下载安装包…' })
    try {
      this.downloadedPath = await downloadUpdateFile(asset, this.options.cacheDirectory, this.options.fetch,
        this.abort.signal, (received, total) => {
          this.setState({ progress: { received, total, percent: Math.round(received / total * 100) } })
        })
      return this.setState({ status: 'downloaded', message: this.state.packageType === 'dmg'
        ? '下载完成并已校验。点击“重启并安装更新”，自动替换应用并重新打开，无需拖拽。'
        : this.state.packageType === 'portable'
          ? '下载完成并已校验。打开文件夹后，退出程序并手动替换旧版免安装文件。'
          : '下载完成并已校验。安装时将退出当前程序并启动覆盖安装。' })
    } catch (error) {
      return this.setState({ status: this.cancelRequested ? 'available' : 'error', progress: null,
        message: this.cancelRequested ? '已取消下载，可以重新下载。'
          : this.abort.signal.aborted ? '下载超时，请检查网络后重试。'
            : error instanceof Error ? error.message : '安装包下载失败，请重试。' })
    } finally {
      clearTimeout(timer)
      this.abort = null
    }
  }

  cancel(): Promise<UpdateState> {
    if (this.state.status === 'downloading') {
      this.cancelRequested = true
      this.abort?.abort()
    }
    return this.operation ?? Promise.resolve(this.getState())
  }

  async install(): Promise<UpdateState> {
    if (this.state.status !== 'downloaded' || !this.downloadedPath || !this.asset) return this.getState()
    if (!this.state.canInstall) {
      return this.setState({ message: '开发模式仅供检查与下载验证，请在正式安装版中执行更新。' })
    }
    this.setState({ status: 'installing', message: this.state.packageType === 'dmg'
      ? '正在校验并准备更新，完成后将退出、替换应用并自动重新打开…' : '正在重新校验并打开安装包…' })
    try {
      await verifyUpdateFile(this.downloadedPath, this.asset)
    } catch (error) {
      this.downloadedPath = null
      return this.setState({ status: 'error', message: error instanceof Error ? error.message : '安装包校验失败，请重新下载。' })
    }
    try {
      await this.options.openInstaller(this.downloadedPath, this.state.packageType === 'portable', this.release!.version)
      if (this.state.packageType === 'portable') {
        return this.setState({ status: 'downloaded', message: '已打开安装包位置，请退出程序后手动替换旧版免安装文件。' })
      }
      return this.getState()
    } catch (error) {
      return this.setState({ status: 'downloaded', message: error instanceof Error ? error.message : '无法准备安装，请重试或前往发布页面手动安装。' })
    }
  }

  async openRelease(): Promise<void> {
    await this.options.openExternal(this.release?.url ?? RELEASES_URL)
  }
}
