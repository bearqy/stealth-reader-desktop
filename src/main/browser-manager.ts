import { BrowserWindow, WebContentsView, session } from 'electron'
import type { BrowserBounds, BrowserState, BrowserTab } from '../shared/contracts'
import { IPC } from '../shared/contracts'
import { clampBrowserZoom, fitBrowserZoom } from './browser-zoom'
import {
  HIDDEN_WEB_MEDIA_CSS,
  TEXT_ONLY_WEB_CSS,
  TRANSPARENT_WEB_CHROME_CSS
} from './web-media'
import {
  isAllowedNavigation,
  isIgnorableLoadError,
  normalizeNavigationInput
} from './url-policy'

interface ManagedTab {
  state: BrowserTab
  view: WebContentsView
  autoFitZoom: boolean
  contentCssKey: string | null
  contentStyleRevision: number
}

export class BrowserManager {
  private readonly tabs = new Map<string, ManagedTab>()
  private activeTabId: string | null = null
  private bounds: BrowserBounds = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false
  }
  private sequence = 0

  constructor(
    private readonly window: BrowserWindow,
    private mediaHidden = false,
    private textOnly = false,
    private transparentChrome = false
  ) {
    const webSession = session.fromPartition('persist:stealth-reader-web')
    webSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    webSession.setPermissionCheckHandler(() => false)
    webSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({
        title: '保存下载文件',
        defaultPath: item.getFilename()
      })
    })
  }

  async create(input = 'https://www.bing.com/'): Promise<BrowserState> {
    const url = normalizeNavigationInput(input)
    const id = `tab-${Date.now()}-${++this.sequence}`
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:stealth-reader-web',
        spellcheck: false
      }
    })
    view.setBackgroundColor('#00000000')
    const tab: ManagedTab = {
      view,
      autoFitZoom: true,
      contentCssKey: null,
      contentStyleRevision: 0,
      state: {
        id,
        title: '新标签',
        url,
        zoomFactor: fitBrowserZoom(this.bounds.width),
        loading: true,
        canGoBack: false,
        canGoForward: false
      }
    }

    this.tabs.set(id, tab)
    view.webContents.setZoomFactor(tab.state.zoomFactor)
    this.window.contentView.addChildView(view)
    this.attachEvents(tab)
    this.activeTabId = id
    this.syncVisibility()
    await this.loadUrl(tab, url)
    this.emitState()
    return this.getState()
  }

  close(tabId: string): BrowserState {
    const tab = this.tabs.get(tabId)
    if (!tab) return this.getState()

    this.window.contentView.removeChildView(tab.view)
    tab.view.webContents.close()
    this.tabs.delete(tabId)

    if (this.activeTabId === tabId) {
      this.activeTabId = this.tabs.keys().next().value ?? null
    }
    this.syncVisibility()
    this.emitState()
    return this.getState()
  }

  activate(tabId: string): BrowserState {
    if (!this.tabs.has(tabId)) {
      throw new Error('网页标签不存在')
    }
    this.activeTabId = tabId
    this.syncVisibility()
    this.emitState()
    return this.getState()
  }

  async navigate(input: string): Promise<BrowserState> {
    let tab = this.activeTab()
    if (!tab) {
      return this.create(input)
    }
    const url = normalizeNavigationInput(input)
    tab.state.url = url
    await this.loadUrl(tab, url)
    return this.getState()
  }

  back(): void {
    const navigation = this.activeTab()?.view.webContents.navigationHistory
    if (navigation?.canGoBack()) navigation.goBack()
  }

  forward(): void {
    const navigation = this.activeTab()?.view.webContents.navigationHistory
    if (navigation?.canGoForward()) navigation.goForward()
  }

  reload(): void {
    this.activeTab()?.view.webContents.reload()
  }

  setMediaHidden(hidden: boolean): void {
    const next = Boolean(hidden)
    if (next === this.mediaHidden) return
    this.mediaHidden = next
    for (const tab of this.tabs.values()) {
      void this.syncContentStyle(tab)
    }
  }

  setTextOnly(enabled: boolean): void {
    const next = Boolean(enabled)
    if (next === this.textOnly) return
    this.textOnly = next
    for (const tab of this.tabs.values()) {
      void this.syncContentStyle(tab)
    }
  }

  setChromeTransparent(enabled: boolean): void {
    const next = Boolean(enabled)
    if (next === this.transparentChrome) return
    this.transparentChrome = next
    for (const tab of this.tabs.values()) {
      void this.syncContentStyle(tab)
    }
  }

  setZoom(zoomFactor: number | null): BrowserState {
    const tab = this.activeTab()
    if (!tab) return this.getState()
    tab.autoFitZoom = zoomFactor === null
    const nextZoom =
      zoomFactor === null ? fitBrowserZoom(this.bounds.width) : clampBrowserZoom(zoomFactor)
    this.applyZoom(tab, nextZoom)
    this.emitState()
    return this.getState()
  }

  setBounds(bounds: BrowserBounds): void {
    const safeNumber = (value: number): number =>
      Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
    this.bounds = {
      x: safeNumber(bounds.x),
      y: safeNumber(bounds.y),
      width: safeNumber(bounds.width),
      height: safeNumber(bounds.height),
      visible: Boolean(bounds.visible)
    }
    let zoomChanged = false
    for (const tab of this.tabs.values()) {
      if (!tab.autoFitZoom) continue
      zoomChanged = this.applyZoom(tab, fitBrowserZoom(this.bounds.width)) || zoomChanged
    }
    this.syncVisibility()
    if (zoomChanged) this.emitState()
  }

  getState(): BrowserState {
    return {
      tabs: [...this.tabs.values()].map((tab) => ({ ...tab.state })),
      activeTabId: this.activeTabId
    }
  }

  destroy(): void {
    for (const tab of this.tabs.values()) {
      tab.view.webContents.close()
    }
    this.tabs.clear()
  }

  private activeTab(): ManagedTab | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
  }

  private applyZoom(tab: ManagedTab, zoomFactor: number): boolean {
    if (tab.state.zoomFactor === zoomFactor) return false
    tab.state.zoomFactor = zoomFactor
    tab.view.webContents.setZoomFactor(zoomFactor)
    return true
  }

  private async loadUrl(tab: ManagedTab, url: string): Promise<void> {
    try {
      await tab.view.webContents.loadURL(url)
    } catch (error) {
      if (!isIgnorableLoadError(error, tab.view.webContents.getURL())) {
        throw error
      }
    }
  }

  private async syncContentStyle(tab: ManagedTab): Promise<void> {
    const revision = ++tab.contentStyleRevision
    const previousKey = tab.contentCssKey
    tab.contentCssKey = null
    if (previousKey) {
      await tab.view.webContents.removeInsertedCSS(previousKey).catch(() => undefined)
    }
    if (tab.view.webContents.isDestroyed()) return
    const css = [
      this.mediaHidden ? HIDDEN_WEB_MEDIA_CSS : '',
      this.textOnly ? TEXT_ONLY_WEB_CSS : '',
      this.transparentChrome ? TRANSPARENT_WEB_CHROME_CSS : ''
    ]
      .filter(Boolean)
      .join('\n')
    if (!css) return

    const key = await tab.view.webContents
      .insertCSS(css, { cssOrigin: 'user' })
      .catch(() => null)
    if (!key) return
    if (
      revision !== tab.contentStyleRevision ||
      (!this.mediaHidden && !this.textOnly && !this.transparentChrome) ||
      tab.view.webContents.isDestroyed()
    ) {
      await tab.view.webContents.removeInsertedCSS(key).catch(() => undefined)
      return
    }
    tab.contentCssKey = key
  }

  private attachEvents(tab: ManagedTab): void {
    const { webContents } = tab.view
    const update = (): void => {
      tab.state.url = webContents.getURL() || tab.state.url
      tab.state.title = webContents.getTitle() || '新标签'
      tab.state.canGoBack = webContents.navigationHistory.canGoBack()
      tab.state.canGoForward = webContents.navigationHistory.canGoForward()
      this.emitState()
    }

    webContents.on('did-start-loading', () => {
      tab.contentStyleRevision += 1
      tab.contentCssKey = null
      tab.state.loading = true
      update()
    })
    webContents.on('dom-ready', () => {
      void this.syncContentStyle(tab)
    })
    webContents.on('did-stop-loading', () => {
      tab.state.loading = false
      update()
    })
    webContents.on('page-title-updated', (_event, title) => {
      tab.state.title = title || '新标签'
      this.emitState()
    })
    webContents.on('did-navigate', update)
    webContents.on('did-navigate-in-page', update)
    webContents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault()
    })
    webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigation(url)) void this.create(url)
      return { action: 'deny' }
    })
    webContents.on('render-process-gone', () => {
      tab.state.loading = false
      tab.state.title = '页面已停止'
      this.emitState()
    })
  }

  private syncVisibility(): void {
    for (const [id, tab] of this.tabs) {
      const visible =
        id === this.activeTabId &&
        this.bounds.visible &&
        this.bounds.width > 0 &&
        this.bounds.height > 0
      if (visible) {
        tab.view.setBounds({
          x: this.bounds.x,
          y: this.bounds.y,
          width: this.bounds.width,
          height: this.bounds.height
        })
      }
      tab.view.setVisible(visible)
    }
  }

  private emitState(): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(IPC.browserState, this.getState())
    }
  }
}
