import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray
} from 'electron'
import type { AppSettings, BrowserBounds } from '../shared/contracts'
import { IPC } from '../shared/contracts'
import { BrowserManager } from './browser-manager'
import { StateStore } from './state-store'
import { readTextFile } from './text-reader'
import { isTrustedRendererNavigation } from './url-policy'
import { resolveWindowOpacity } from './window-visibility'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let browserManager: BrowserManager | null = null
let stateStore: StateStore
let quitting = false
let pointerVisibilityTimer: NodeJS.Timeout | null = null
let appliedWindowOpacity: number | null = null

function trayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path d="M2.5 3.5h4.1A2.4 2.4 0 0 1 9 5.9v8.6a3.2 3.2 0 0 0-2.4-1.1H2.5z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M15.5 3.5h-4.1A2.4 2.4 0 0 0 9 5.9v8.6a3.2 3.2 0 0 1 2.4-1.1h4.1z" fill="none" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`
  const image = nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 18, height: 18 })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function showWindow(): void {
  if (!mainWindow) return
  setWindowOpacity(stateStore.getSettings().opacity)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
    return
  }
  showWindow()
}

function registerBossShortcut(shortcut: string, previous?: string): void {
  if (previous) globalShortcut.unregister(previous)
  if (!globalShortcut.register(shortcut, toggleWindow)) {
    if (previous) globalShortcut.register(previous, toggleWindow)
    throw new Error(`快捷键 ${shortcut} 已被其他应用占用`)
  }
}

async function registerInitialBossShortcut(): Promise<void> {
  const configured = stateStore.getSettings().bossShortcut
  const candidates = [configured, 'CommandOrControl+Shift+J'].filter(
    (shortcut, index, all) => all.indexOf(shortcut) === index
  )

  for (const candidate of candidates) {
    try {
      registerBossShortcut(candidate)
      if (candidate !== configured) {
        await stateStore.updateSettings({ bossShortcut: candidate })
      }
      return
    } catch {
      // Try the next safe fallback. The tray remains available if every shortcut is occupied.
    }
  }
}

function createTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('Stealth Reader')
  const trayMenu = Menu.buildFromTemplate([
    { label: '显示程序', click: showWindow },
    {
      label: '退出程序',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  if (process.platform === 'darwin') {
    tray.on('click', () => tray?.popUpContextMenu(trayMenu))
    tray.on('right-click', () => tray?.popUpContextMenu(trayMenu))
  } else {
    tray.setContextMenu(trayMenu)
  }
}

function isPointerInsideWindow(): boolean {
  if (!mainWindow) return false
  const pointer = screen.getCursorScreenPoint()
  const bounds = mainWindow.getBounds()
  return (
    pointer.x >= bounds.x &&
    pointer.x < bounds.x + bounds.width &&
    pointer.y >= bounds.y &&
    pointer.y < bounds.y + bounds.height
  )
}

function stopPointerVisibilityTracking(): void {
  if (!pointerVisibilityTimer) return
  clearInterval(pointerVisibilityTimer)
  pointerVisibilityTimer = null
}

function setWindowOpacity(opacity: number): void {
  if (!mainWindow || appliedWindowOpacity === opacity) return
  mainWindow.setOpacity(opacity)
  appliedWindowOpacity = opacity
}

function refreshWindowOpacity(settings = stateStore.getSettings()): void {
  if (!mainWindow) return
  setWindowOpacity(resolveWindowOpacity(settings, isPointerInsideWindow()))
}

function updatePointerVisibilityTracking(settings: AppSettings): void {
  if (!settings.hideWhenPointerLeaves) {
    stopPointerVisibilityTracking()
    return
  }
  if (!pointerVisibilityTimer) {
    pointerVisibilityTimer = setInterval(refreshWindowOpacity, 80)
  }
}

function applyWindowSettings(settings: AppSettings): void {
  if (!mainWindow) return
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop)
  if (process.platform === 'darwin') {
    mainWindow.setHasShadow(!settings.transparentAppChrome)
    mainWindow.setWindowButtonVisibility(!settings.transparentAppChrome)
  }
  updatePointerVisibilityTracking(settings)
  refreshWindowOpacity(settings)
}

async function createWindow(): Promise<void> {
  const settings = stateStore.getSettings()
  const rendererFile = join(__dirname, '../renderer/index.html')
  const developmentUrl = process.env.ELECTRON_RENDERER_URL
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 500,
    show: false,
    transparent: process.platform === 'darwin',
    backgroundColor: process.platform === 'darwin' ? '#00000000' : '#edf1ec',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Stealth Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  applyWindowSettings(settings)
  browserManager = new BrowserManager(
    mainWindow,
    settings.hideWebMedia,
    settings.textOnlyWeb,
    settings.transparentAppChrome
  )
  const allowTrustedNavigation = (event: Electron.Event, url: string): void => {
    if (!isTrustedRendererNavigation(url, developmentUrl, rendererFile)) {
      event.preventDefault()
    }
  }
  mainWindow.webContents.on('will-navigate', allowTrustedNavigation)
  mainWindow.webContents.on('will-redirect', allowTrustedNavigation)
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    stopPointerVisibilityTracking()
    appliedWindowOpacity = null
    browserManager?.destroy()
    browserManager = null
    mainWindow = null
  })
  mainWindow.on('ready-to-show', () => {
    showWindow()
  })

  if (developmentUrl) {
    await mainWindow.loadURL(developmentUrl)
  } else {
    await mainWindow.loadFile(rendererFile)
  }

  await browserManager.create()
}

function registerIpc(): void {
  const assertTrustedSender = (event: IpcMainInvokeEvent): void => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      throw new Error('拒绝来自非应用界面的请求')
    }
  }

  ipcMain.handle(IPC.bootstrap, (event) => {
    assertTrustedSender(event)
    return {
      settings: stateStore.getSettings(),
      library: stateStore.getLibrary(),
      browser: browserManager?.getState() ?? { tabs: [], activeTabId: null }
    }
  })

  ipcMain.handle(IPC.settingsUpdate, async (event, patch: Partial<AppSettings>) => {
    assertTrustedSender(event)
    const previous = stateStore.getSettings()
    const next = await stateStore.updateSettings(patch)
    if (next.bossShortcut !== previous.bossShortcut) {
      try {
        registerBossShortcut(next.bossShortcut, previous.bossShortcut)
      } catch (error) {
        await stateStore.updateSettings({ bossShortcut: previous.bossShortcut })
        throw error
      }
    }
    if (next.hideWebMedia !== previous.hideWebMedia) {
      browserManager?.setMediaHidden(next.hideWebMedia)
    }
    if (next.textOnlyWeb !== previous.textOnlyWeb) {
      browserManager?.setTextOnly(next.textOnlyWeb)
    }
    if (next.transparentAppChrome !== previous.transparentAppChrome) {
      browserManager?.setChromeTransparent(next.transparentAppChrome)
    }
    applyWindowSettings(next)
    return next
  })

  ipcMain.handle(IPC.windowHide, (event) => {
    assertTrustedSender(event)
    mainWindow?.hide()
  })
  ipcMain.handle(IPC.windowMinimize, (event) => {
    assertTrustedSender(event)
    mainWindow?.minimize()
  })

  ipcMain.handle(IPC.browserCreate, (event, url?: string) => {
    assertTrustedSender(event)
    return browserManager?.create(url)
  })
  ipcMain.handle(IPC.browserClose, (event, tabId: string) => {
    assertTrustedSender(event)
    return browserManager?.close(tabId)
  })
  ipcMain.handle(IPC.browserActivate, (event, tabId: string) => {
    assertTrustedSender(event)
    return browserManager?.activate(tabId)
  })
  ipcMain.handle(IPC.browserNavigate, (event, input: string) => {
    assertTrustedSender(event)
    return browserManager?.navigate(input)
  })
  ipcMain.handle(IPC.browserBack, (event) => {
    assertTrustedSender(event)
    browserManager?.back()
  })
  ipcMain.handle(IPC.browserForward, (event) => {
    assertTrustedSender(event)
    browserManager?.forward()
  })
  ipcMain.handle(IPC.browserReload, (event) => {
    assertTrustedSender(event)
    browserManager?.reload()
  })
  ipcMain.handle(IPC.browserSetZoom, (event, zoomFactor: number | null) => {
    assertTrustedSender(event)
    return browserManager?.setZoom(zoomFactor)
  })
  ipcMain.handle(IPC.browserSetBounds, (event, bounds: BrowserBounds) => {
    assertTrustedSender(event)
    browserManager?.setBounds(bounds)
  })

  ipcMain.handle(IPC.libraryImportText, async (event) => {
    assertTrustedSender(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入 TXT',
      properties: ['openFile'],
      filters: [{ name: '文本文件', extensions: ['txt', 'text', 'md'] }]
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    const decoded = await readTextFile(filePath)
    const item = await stateStore.addTextFile(filePath)
    return { item, ...decoded }
  })

  ipcMain.handle(IPC.libraryOpen, async (event, itemId: string) => {
    assertTrustedSender(event)
    const stored = stateStore.getStoredItem(itemId)
    const decoded = await readTextFile(stored.filePath)
    const item = await stateStore.touchItem(itemId)
    return { item, ...decoded }
  })
  ipcMain.handle(
    IPC.libraryUpdateProgress,
    (event, itemId: string, progress: number) => {
      assertTrustedSender(event)
      return stateStore.updateProgress(itemId, progress)
    }
  )
  ipcMain.handle(IPC.libraryRemove, (event, itemId: string) => {
    assertTrustedSender(event)
    return stateStore.removeItem(itemId)
  })
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.stealthreader.desktop')
  stateStore = new StateStore(join(app.getPath('userData'), 'local-state.json'))
  await stateStore.load()
  registerIpc()
  await registerInitialBossShortcut()
  createTray()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    else showWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
