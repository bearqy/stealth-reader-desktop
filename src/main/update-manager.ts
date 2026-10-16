import type { UpdateState } from '../shared/contracts'
import { downloadUpdateFile, verifyUpdateFile, type UpdateFetch } from './update-download'
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
  openInstaller: (file: string, portable: boolean) => Promise<void>
  openExternal: (url: string) => Promise<void>
}

export class UpdateManager {
  private state: UpdateState
  private release: ParsedRelease | null = null
  private asset: ReleaseAsset | null = null
  private downloadedPath: string | null = null
  private operation: Promise<UpdateState> | null = null
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
    if (!this.state.packageType || ['downloaded', 'installing'].includes(this.state.status)) {
      return Promise.resolve(this.getState())
    }
    const operation = this.checkRelease()
    this.operation = operation
    void operation.finally(() => { this.operation = null })
    return operation
  }

  private async checkRelease(): Promise<UpdateState> {
    this.release = null
    this.asset = null
    this.setState({ status: 'checking', message: '正在连接 GitHub Releases…', progress: null, latest: null })
    const controller = new AbortController()
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
      this.release = parseGitHubRelease(await response.json())
      this.asset = selectReleaseAsset(this.release, this.options.target)
      const latest = {
        version: this.release.version, title: this.release.title, notes: this.release.notes,
        publishedAt: this.release.publishedAt, assetName: this.asset?.name ?? null,
        size: this.asset?.size ?? null
      }
      const checkedAt = new Date().toISOString()
      if (!isNewerVersion(this.release.version, this.state.currentVersion)) {
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
    if (!this.asset?.sha256 || !['available', 'error'].includes(this.state.status)) {
      return Promise.resolve(this.getState())
    }
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
        ? '下载完成并已校验。打开 DMG 后，将应用拖入“应用程序”覆盖旧版。'
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
    this.setState({ status: 'installing', message: '正在重新校验并打开安装包…' })
    try {
      await verifyUpdateFile(this.downloadedPath, this.asset)
      await this.options.openInstaller(this.downloadedPath, this.state.packageType === 'portable')
      if (this.state.packageType === 'portable') {
        return this.setState({ status: 'downloaded', message: '已打开安装包位置，请退出程序后手动替换旧版免安装文件。' })
      }
      return this.getState()
    } catch (error) {
      this.downloadedPath = null
      return this.setState({ status: 'error', message: error instanceof Error ? error.message : '无法启动安装包，请重新下载。' })
    }
  }

  async openRelease(): Promise<void> {
    await this.options.openExternal(this.release?.url ?? RELEASES_URL)
  }
}
