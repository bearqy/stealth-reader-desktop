import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Tray
} from 'electron'
import type { AppSettings, BrowserBounds } from '../shared/contracts'
import { IPC } from '../shared/contracts'
import { BrowserManager } from './browser-manager'
import { StateStore } from './state-store'
import { readTextFile } from './text-reader'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let browserManager: BrowserManager | null = null
let stateStore: StateStore
let quitting = false

function trayIcon(): Electron.NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#17201c"/>
      <path d="M9 10h10a4 4 0 0 1 4 4v8H13a4 4 0 0 1-4-4z" fill="#d5efdf"/>
      <path d="M13 14h7M13 17h6" stroke="#17201c" stroke-width="1.7" stroke-linecap="round"/>
    </svg>`
  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    .resize({ width: 18, height: 18 })
}

function showWindow(): void {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide()
  else showWindow()
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示/隐藏', click: toggleWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('double-click', showWindow)
}

function applyWindowSettings(settings: AppSettings): void {
  if (!mainWindow) return
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop)
  mainWindow.setOpacity(settings.opacity)
}

async function createWindow(): Promise<void> {
  const settings = stateStore.getSettings()
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 500,
    show: false,
    backgroundColor: '#edf1ec',
    title: 'Stealth Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  applyWindowSettings(settings)
  browserManager = new BrowserManager(mainWindow)

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    browserManager?.destroy()
    browserManager = null
    mainWindow = null
  })
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  await browserManager.create()
}

function registerIpc(): void {
  ipcMain.handle(IPC.bootstrap, () => ({
    settings: stateStore.getSettings(),
    library: stateStore.getLibrary(),
    browser: browserManager?.getState() ?? { tabs: [], activeTabId: null }
  }))

  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: Partial<AppSettings>) => {
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
    applyWindowSettings(next)
    return next
  })

  ipcMain.handle(IPC.windowHide, () => mainWindow?.hide())
  ipcMain.handle(IPC.windowMinimize, () => mainWindow?.minimize())

  ipcMain.handle(IPC.browserCreate, (_event, url?: string) => browserManager?.create(url))
  ipcMain.handle(IPC.browserClose, (_event, tabId: string) => browserManager?.close(tabId))
  ipcMain.handle(IPC.browserActivate, (_event, tabId: string) =>
    browserManager?.activate(tabId)
  )
  ipcMain.handle(IPC.browserNavigate, (_event, input: string) =>
    browserManager?.navigate(input)
  )
  ipcMain.handle(IPC.browserBack, () => browserManager?.back())
  ipcMain.handle(IPC.browserForward, () => browserManager?.forward())
  ipcMain.handle(IPC.browserReload, () => browserManager?.reload())
  ipcMain.handle(IPC.browserSetBounds, (_event, bounds: BrowserBounds) =>
    browserManager?.setBounds(bounds)
  )

  ipcMain.handle(IPC.libraryImportText, async () => {
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

  ipcMain.handle(IPC.libraryOpen, async (_event, itemId: string) => {
    const stored = stateStore.getStoredItem(itemId)
    const decoded = await readTextFile(stored.filePath)
    const item = await stateStore.touchItem(itemId)
    return { item, ...decoded }
  })
  ipcMain.handle(
    IPC.libraryUpdateProgress,
    (_event, itemId: string, progress: number) =>
      stateStore.updateProgress(itemId, progress)
  )
  ipcMain.handle(IPC.libraryRemove, (_event, itemId: string) =>
    stateStore.removeItem(itemId)
  )
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
