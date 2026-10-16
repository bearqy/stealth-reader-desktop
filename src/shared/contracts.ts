export type AppMode = 'browser' | 'reader'
export type ReaderFontFamily = 'sans' | 'serif' | 'kai'

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
  readerFontFamily: ReaderFontFamily
  readerLetterSpacing: number
  readerLineHeight: number
  readerTheme: 'paper' | 'green' | 'dark'
  checkUpdatesOnLaunch: boolean
}

export interface UpdateRelease {
  version: string
  title: string
  notes: string
  publishedAt: string | null
  assetName: string | null
  size: number | null
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'unsupported' | 'error'
  currentVersion: string
  system: string
  architecture: string
  packageType: 'dmg' | 'nsis' | 'portable' | null
  canInstall: boolean
  latest: UpdateRelease | null
  checkedAt: string | null
  progress: { received: number; total: number; percent: number } | null
  message: string
}

export interface ReaderPosition {
  chapterStart: number
  chapterProgress: number
}

export interface LibraryItem {
  id: string
  title: string
  fileName: string
  progress: number
  readerPosition?: ReaderPosition
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
  updates: UpdateState
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
  updates: {
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    cancel(): Promise<UpdateState>
    install(): Promise<UpdateState>
    openRelease(): Promise<void>
    onState(listener: (state: UpdateState) => void): () => void
    onShow(listener: () => void): () => void
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
    updateProgress(itemId: string, progress: number, position?: ReaderPosition): Promise<LibraryItem[]>
    remove(itemId: string): Promise<LibraryItem[]>
  }
}

export const IPC = {
  bootstrap: 'app:bootstrap',
  settingsUpdate: 'settings:update',
  windowHide: 'window:hide',
  windowMinimize: 'window:minimize',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesCancel: 'updates:cancel',
  updatesInstall: 'updates:install',
  updatesOpenRelease: 'updates:open-release',
  updatesState: 'updates:state',
  updatesShow: 'updates:show',
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
