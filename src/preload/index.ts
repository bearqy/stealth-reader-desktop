import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  BootstrapState,
  BrowserBounds,
  BrowserState,
  StealthReaderApi,
  TextDocument
} from '../shared/contracts'
import { IPC } from '../shared/contracts'

const api: StealthReaderApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap) as Promise<BootstrapState>,
  settings: {
    update: (patch: Partial<AppSettings>) =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<AppSettings>
  },
  window: {
    hide: () => ipcRenderer.invoke(IPC.windowHide) as Promise<void>,
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize) as Promise<void>
  },
  browser: {
    create: (url?: string) =>
      ipcRenderer.invoke(IPC.browserCreate, url) as Promise<BrowserState>,
    close: (tabId: string) =>
      ipcRenderer.invoke(IPC.browserClose, tabId) as Promise<BrowserState>,
    activate: (tabId: string) =>
      ipcRenderer.invoke(IPC.browserActivate, tabId) as Promise<BrowserState>,
    navigate: (input: string) =>
      ipcRenderer.invoke(IPC.browserNavigate, input) as Promise<BrowserState>,
    back: () => ipcRenderer.invoke(IPC.browserBack) as Promise<void>,
    forward: () => ipcRenderer.invoke(IPC.browserForward) as Promise<void>,
    reload: () => ipcRenderer.invoke(IPC.browserReload) as Promise<void>,
    setBounds: (bounds: BrowserBounds) =>
      ipcRenderer.invoke(IPC.browserSetBounds, bounds) as Promise<void>,
    onState: (listener: (state: BrowserState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: BrowserState): void =>
        listener(state)
      ipcRenderer.on(IPC.browserState, handler)
      return () => ipcRenderer.removeListener(IPC.browserState, handler)
    }
  },
  library: {
    importText: () =>
      ipcRenderer.invoke(IPC.libraryImportText) as Promise<TextDocument | null>,
    open: (itemId: string) =>
      ipcRenderer.invoke(IPC.libraryOpen, itemId) as Promise<TextDocument>,
    updateProgress: (itemId: string, progress: number) =>
      ipcRenderer.invoke(IPC.libraryUpdateProgress, itemId, progress),
    remove: (itemId: string) => ipcRenderer.invoke(IPC.libraryRemove, itemId)
  }
}

contextBridge.exposeInMainWorld('stealthReader', api)
