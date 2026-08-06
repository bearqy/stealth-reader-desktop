export type AppMode = 'browser' | 'reader'

export interface AppSettings {
  alwaysOnTop: boolean
  opacity: number
  hideWhenPointerLeaves: boolean
  sidebarHidden: boolean
  hideWebMedia: boolean
  textOnlyWeb: boolean
  transparentAppChrome: boolean
  bossShortcut: string
  toolbarCollapsed: boolean
  readerFontSize: number
  readerLineHeight: number
  readerTheme: 'paper' | 'green' | 'dark'
}

export interface LibraryItem {
  id: string
  title: string
  fileName: string
  progress: number
  lastOpenedAt: string
}

export interface TextDocument {
  item: LibraryItem
  content: string
  encoding: string
}

export interface BrowserTab {
  id: string
  title: string
  url: string
  zoomFactor: number
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

export interface BrowserState {
  tabs: BrowserTab[]
  activeTabId: string | null
}

export interface BootstrapState {
  settings: AppSettings
  library: LibraryItem[]
  browser: BrowserState
}

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
  visible: boolean
}

export interface StealthReaderApi {
  bootstrap(): Promise<BootstrapState>
  settings: {
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  window: {
    hide(): Promise<void>
    minimize(): Promise<void>
  }
  browser: {
    create(url?: string): Promise<BrowserState>
    close(tabId: string): Promise<BrowserState>
    activate(tabId: string): Promise<BrowserState>
    navigate(input: string): Promise<BrowserState>
    back(): Promise<void>
    forward(): Promise<void>
    reload(): Promise<void>
    setZoom(zoomFactor: number | null): Promise<BrowserState>
    setBounds(bounds: BrowserBounds): Promise<void>
    onState(listener: (state: BrowserState) => void): () => void
  }
  library: {
    importText(): Promise<TextDocument | null>
    open(itemId: string): Promise<TextDocument>
    updateProgress(itemId: string, progress: number): Promise<LibraryItem[]>
    remove(itemId: string): Promise<LibraryItem[]>
  }
}

export const IPC = {
  bootstrap: 'app:bootstrap',
  settingsUpdate: 'settings:update',
  windowHide: 'window:hide',
  windowMinimize: 'window:minimize',
  browserCreate: 'browser:create',
  browserClose: 'browser:close',
  browserActivate: 'browser:activate',
  browserNavigate: 'browser:navigate',
  browserBack: 'browser:back',
  browserForward: 'browser:forward',
  browserReload: 'browser:reload',
  browserSetZoom: 'browser:set-zoom',
  browserSetBounds: 'browser:set-bounds',
  browserState: 'browser:state',
  libraryImportText: 'library:import-text',
  libraryOpen: 'library:open',
  libraryUpdateProgress: 'library:update-progress',
  libraryRemove: 'library:remove'
} as const
