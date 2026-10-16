import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, normalize } from 'node:path'
import type { AppSettings, LibraryItem, ReaderPosition } from '../shared/contracts'
import { validReaderPosition } from '../shared/reading-position'
import { DEFAULT_READER_TYPOGRAPHY, readerFontFamily, readerLetterSpacing } from '../shared/reader-typography'

interface StoredLibraryItem extends LibraryItem {
  filePath: string
}

interface PersistedState {
  version: 2
  settings: AppSettings
  library: StoredLibraryItem[]
}

type StoredSettings = Partial<AppSettings> & {
  hideWhenUnfocused?: boolean
  collapseChromeOnBlur?: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: false,
  opacity: 1,
  hideWhenPointerLeaves: false,
  sidebarHidden: false,
  hideWebMedia: false,
  textOnlyWeb: false,
  transparentAppChrome: false,
  bossShortcut: 'CommandOrControl+Shift+H',
  toolbarCollapsed: false,
  ...DEFAULT_READER_TYPOGRAPHY,
  readerTheme: 'paper',
  checkUpdatesOnLaunch: true
}

function defaultState(): PersistedState {
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS },
    library: []
  }
}

function clampSettings(settings: StoredSettings): AppSettings {
  return {
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    opacity: Math.min(1, Math.max(0.35, Number(settings.opacity) || 1)),
    hideWhenPointerLeaves:
      settings.hideWhenPointerLeaves === undefined
        ? Boolean(settings.hideWhenUnfocused)
        : Boolean(settings.hideWhenPointerLeaves),
    sidebarHidden: Boolean(settings.sidebarHidden),
    hideWebMedia: Boolean(settings.hideWebMedia),
    textOnlyWeb: Boolean(settings.textOnlyWeb),
    transparentAppChrome: Boolean(settings.transparentAppChrome),
    bossShortcut:
      typeof settings.bossShortcut === 'string' && settings.bossShortcut.trim()
        ? settings.bossShortcut.trim()
        : DEFAULT_SETTINGS.bossShortcut,
    toolbarCollapsed:
      settings.toolbarCollapsed === undefined
        ? Boolean(settings.collapseChromeOnBlur)
        : Boolean(settings.toolbarCollapsed),
    readerFontSize: Math.min(
      34,
      Math.max(12, Number(settings.readerFontSize) || DEFAULT_SETTINGS.readerFontSize)
    ),
    readerFontFamily: readerFontFamily(settings.readerFontFamily),
    readerLetterSpacing: readerLetterSpacing(settings.readerLetterSpacing),
    readerLineHeight: Math.min(
      2.8,
      Math.max(1.2, Number(settings.readerLineHeight) || DEFAULT_SETTINGS.readerLineHeight)
    ),
    readerTheme:
      settings.readerTheme === 'green' || settings.readerTheme === 'dark'
        ? settings.readerTheme
        : 'paper',
    checkUpdatesOnLaunch: settings.checkUpdatesOnLaunch === undefined
      ? true
      : Boolean(settings.checkUpdatesOnLaunch)
  }
}

export class StateStore {
  private state: PersistedState = defaultState()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<PersistedState>
      this.state = {
        version: 2,
        settings: clampSettings(raw.settings ?? {}),
        library: Array.isArray(raw.library)
          ? raw.library.filter(
              (item): item is StoredLibraryItem =>
                typeof item?.id === 'string' &&
                typeof item?.title === 'string' &&
                typeof item?.fileName === 'string' &&
                typeof item?.filePath === 'string' &&
                typeof item?.progress === 'number' &&
                typeof item?.lastOpenedAt === 'string'
            ).map((item) => {
              const { readerPosition, ...rest } = item
              return validReaderPosition(readerPosition) ? { ...rest, readerPosition: { ...readerPosition } } : rest
            })
          : []
      }
    } catch {
      this.state = defaultState()
    }
  }

  getSettings(): AppSettings {
    return { ...this.state.settings }
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.state.settings = clampSettings({ ...this.state.settings, ...patch })
    await this.persist()
    return this.getSettings()
  }

  getLibrary(): LibraryItem[] {
    return this.state.library
      .map(({ filePath: _filePath, ...item }) => ({ ...item,
        ...(item.readerPosition ? { readerPosition: { ...item.readerPosition } } : {}) }))
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
  }

  getStoredItem(id: string): StoredLibraryItem {
    const item = this.state.library.find((candidate) => candidate.id === id)
    if (!item) {
      throw new Error('书籍不存在或已被移除')
    }
    return { ...item }
  }

  async addTextFile(filePath: string): Promise<LibraryItem> {
    const normalizedPath = normalize(filePath)
    const id = createHash('sha256').update(normalizedPath).digest('hex').slice(0, 20)
    const now = new Date().toISOString()
    const existing = this.state.library.find((item) => item.id === id)

    if (existing) {
      existing.lastOpenedAt = now
      await this.persist()
      const { filePath: _filePath, ...item } = existing
      return { ...item }
    }

    const fileName = basename(normalizedPath)
    const stored: StoredLibraryItem = {
      id,
      title: fileName.replace(/\.[^.]+$/, ''),
      fileName,
      filePath: normalizedPath,
      progress: 0,
      lastOpenedAt: now
    }
    this.state.library.push(stored)
    await this.persist()
    const { filePath: _filePath, ...item } = stored
    return { ...item }
  }

  async touchItem(id: string): Promise<LibraryItem> {
    const item = this.state.library.find((candidate) => candidate.id === id)
    if (!item) {
      throw new Error('书籍不存在或已被移除')
    }
    item.lastOpenedAt = new Date().toISOString()
    await this.persist()
    const { filePath: _filePath, ...publicItem } = item
    return { ...publicItem }
  }

  async updateProgress(id: string, progress: number, position?: ReaderPosition): Promise<LibraryItem[]> {
    const item = this.state.library.find((candidate) => candidate.id === id)
    if (!item) {
      throw new Error('书籍不存在或已被移除')
    }
    if (!Number.isFinite(progress)) {
      throw new Error('阅读进度无效')
    }
    if (position !== undefined && !validReaderPosition(position)) throw new Error('章节阅读位置无效')
    item.progress = Math.min(1, Math.max(0, progress))
    if (position) item.readerPosition = { ...position }
    item.lastOpenedAt = new Date().toISOString()
    await this.persist()
    return this.getLibrary()
  }

  async removeItem(id: string): Promise<LibraryItem[]> {
    this.state.library = this.state.library.filter((item) => item.id !== id)
    await this.persist()
    return this.getLibrary()
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.state, null, 2)
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true })
        const temporaryPath = `${this.filePath}.tmp`
        await writeFile(temporaryPath, snapshot, { encoding: 'utf8', mode: 0o600 })
        await rename(temporaryPath, this.filePath)
      })
    await this.writeQueue
  }
}
