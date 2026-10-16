import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type {
  AppMode,
  AppSettings,
  BrowserState,
  LibraryItem,
  ReaderPosition,
  TextDocument,
  UpdateState
} from '../../shared/contracts'
import { DEFAULT_READING_SITES } from '../../shared/default-sites'
import { ChapterReader } from './ChapterReader'
import { ReaderTypographySettings } from './ReaderTypographySettings'
import { UpdatePanel } from './UpdatePanel'

type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'book'
  | 'browser'
  | 'droplet'
  | 'download'
  | 'eye-off'
  | 'gear'
  | 'media-off'
  | 'list'
  | 'minimize'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'text-only'
  | 'trash'
  | 'upload'
  | 'x'

const ICON_PATHS: Record<IconName, ReactNode> = {
  'arrow-left': <path d="m15 18-6-6 6-6" />,
  'arrow-right': <path d="m9 18 6-6-6-6" />,
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  browser: (
    <>
      <rect width="18" height="16" x="3" y="4" rx="2" />
      <path d="M3 9h18M8 4v5" />
    </>
  ),
  droplet: <path d="M12 2.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" />,
  download: <path d="M12 3v12M7 10l5 5 5-5M4 17v4h16v-4" />,
  'eye-off': (
    <>
      <path d="m3 3 18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 8.5 4 9.5 6-.4.8-1.1 1.8-2 2.8M6.6 6.6C4.6 8 3.2 10 2.5 11.5 3.5 13.5 7 17 12 17c1 0 2-.1 2.9-.4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  'media-off': (
    <>
      <rect width="18" height="16" x="3" y="4" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m4 17 4.5-4.5 3.5 3.5 2-2 6 6M3 3l18 18" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 6v5h-5M4 18v-5h5M5.6 9a7 7 0 0 1 11.8-2.6L20 11M4 13l2.6 4.6A7 7 0 0 0 18.4 15" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  'text-only': <path d="M5 5h14M12 5v14M8 19h8" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  x: <path d="m7 7 10 10M17 7 7 17" />
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

function IconButton({
  label,
  icon,
  className,
  disabled,
  pressed,
  onClick
}: {
  label: string
  icon: IconName
  className?: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={`icon-button ${className ?? ''}`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}


export function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AppMode>('browser')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [updates, setUpdates] = useState<UpdateState | null>(null)
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [browser, setBrowser] = useState<BrowserState>({ tabs: [], activeTabId: null })
  const [address, setAddress] = useState('')
  const [document, setDocument] = useState<TextDocument | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const browserSurfaceRef = useRef<HTMLDivElement>(null)
  const removedBooksRef = useRef(new Set<string>())

  const showUpdates = useCallback(() => {
    setShowSettings(true)
    setTimeout(() => window.document.getElementById('app-updates')?.scrollIntoView({ block: 'start' }), 0)
  }, [])

  const activeTab = browser.tabs.find((tab) => tab.id === browser.activeTabId)
  const searchMatchCount = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase()
    if (!term || !document) return 0
    const content = document.content.toLocaleLowerCase()
    let count = 0
    let cursor = 0
    while (count < 300) {
      const found = content.indexOf(term, cursor)
      if (found < 0) break
      count += 1
      cursor = found + term.length
    }
    return count
  }, [document?.content, searchQuery])

  useEffect(() => {
    let mounted = true
    window.stealthReader
      .bootstrap()
      .then((initial) => {
        if (!mounted) return
        setSettings(initial.settings)
        setUpdates(initial.updates)
        setLibrary(initial.library)
        setBrowser(initial.browser)
        const current = initial.browser.tabs.find(
          (tab) => tab.id === initial.browser.activeTabId
        )
        setAddress(current?.url ?? '')
      })
      .catch((error: unknown) => setNotice(String(error)))
      .finally(() => setLoading(false))

    const unsubscribe = window.stealthReader.browser.onState((next) => {
      setBrowser(next)
    })
    const unsubscribeUpdates = window.stealthReader.updates.onState(setUpdates)
    const unsubscribeShowUpdates = window.stealthReader.updates.onShow(showUpdates)
    return () => {
      mounted = false
      unsubscribe()
      unsubscribeUpdates()
      unsubscribeShowUpdates()
    }
  }, [])

  useEffect(() => {
    if (activeTab?.url) setAddress(activeTab.url)
  }, [activeTab?.id, activeTab?.url])

  const syncBrowserBounds = useCallback(() => {
    const rect = browserSurfaceRef.current?.getBoundingClientRect()
    void window.stealthReader.browser.setBounds({
      x: rect?.x ?? 0,
      y: rect?.y ?? 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      visible: mode === 'browser' && !showSettings
    })
  }, [mode, showSettings])

  useEffect(() => {
    const element = browserSurfaceRef.current
    if (!element) {
      syncBrowserBounds()
      return
    }
    const observer = new ResizeObserver(syncBrowserBounds)
    observer.observe(element)
    window.addEventListener('resize', syncBrowserBounds)
    syncBrowserBounds()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', syncBrowserBounds)
    }
  }, [syncBrowserBounds, settings?.toolbarCollapsed, loading])

  const reportError = (error: unknown): void => {
    setNotice(error instanceof Error ? error.message : String(error))
  }

  const updateSettings = async (patch: Partial<AppSettings>): Promise<void> => {
    try {
      const next = await window.stealthReader.settings.update(patch)
      setSettings(next)
      setNotice('设置已保存在本机')
    } catch (error) {
      reportError(error)
    }
  }

  const handleNavigate = (event: FormEvent): void => {
    event.preventDefault()
    window.stealthReader.browser.navigate(address).catch(reportError)
  }

  const openDefaultSite = (url: string): void => {
    setMode('browser')
    setShowSettings(false)
    setAddress(url)
    window.stealthReader.browser.navigate(url).catch(reportError)
  }

  const importText = async (): Promise<void> => {
    try {
      const imported = await window.stealthReader.library.importText()
      if (!imported) return
      removedBooksRef.current.delete(imported.item.id)
      setDocument(imported)
      setLibrary((current) => [
        imported.item,
        ...current.filter((item) => item.id !== imported.item.id)
      ])
      setMode('reader')
      setSearchQuery('')
    } catch (error) {
      reportError(error)
    }
  }

  const openBook = async (itemId: string): Promise<void> => {
    try {
      const opened = await window.stealthReader.library.open(itemId)
      setDocument(opened)
      setLibrary((current) => [
        opened.item,
        ...current.filter((item) => item.id !== opened.item.id)
      ])
      setMode('reader')
      setSearchQuery('')
    } catch (error) {
      reportError(error)
    }
  }

  const removeBook = async (itemId: string): Promise<void> => {
    removedBooksRef.current.add(itemId)
    try {
      const next = await window.stealthReader.library.remove(itemId)
      setLibrary(next)
      if (document?.item.id === itemId) setDocument(null)
    } catch (error) {
      removedBooksRef.current.delete(itemId)
      reportError(error)
    }
  }

  const saveProgress = useCallback((itemId: string, progress: number, position: ReaderPosition): void => {
    // A removed reader also unmounts; do not flush its pending bookmark back to the store.
    if (removedBooksRef.current.has(itemId)) return
    // Keep the open book in sync too: returning from settings or the browser remounts ReaderView.
    setDocument((current) => current?.item.id === itemId
      ? { ...current, item: { ...current.item, progress, readerPosition: position } }
      : current)
    void window.stealthReader.library
      .updateProgress(itemId, progress, position)
      .then(setLibrary)
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : String(error))
      )
  }, [])

  if (loading || !settings) {
    return (
      <div className="launch-screen">
        <div className="launch-mark">S</div>
        <p>正在打开本地空间…</p>
      </div>
    )
  }

  return (
    <div
      className={`app-shell ${settings.toolbarCollapsed ? 'chrome-collapsed' : ''} ${
        settings.sidebarHidden ? 'sidebar-hidden' : ''
      } ${settings.textOnlyWeb ? 'text-only-web' : ''} ${
        settings.transparentAppChrome ? 'transparent-app-chrome' : ''
      }`}
    >
      <div className="window-drag-region" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>Stealth</strong>
            <span>LOCAL READER</span>
          </div>
        </div>

        <nav className="mode-switcher" aria-label="工作区">
          <button
            className={mode === 'browser' ? 'active' : ''}
            type="button"
            onClick={() => {
              setMode('browser')
              setShowSettings(false)
            }}
          >
            <Icon name="browser" />
            网页
          </button>
          <button
            className={mode === 'reader' ? 'active' : ''}
            type="button"
            onClick={() => {
              setMode('reader')
              setShowSettings(false)
            }}
          >
            <Icon name="book" />
            阅读
          </button>
        </nav>

        {mode === 'browser' ? (
          <div className="sidebar-section">
            <div className="section-heading">
              <span>常用站点</span>
              <span className="section-count">{DEFAULT_READING_SITES.length}</span>
            </div>
            <div className="site-list">
              {DEFAULT_READING_SITES.map((site) => {
                const isActive = activeTab?.url.startsWith(new URL(site.url).origin)
                return (
                  <button
                    className={`site-item ${isActive ? 'active' : ''}`}
                    key={site.id}
                    title={site.url}
                    type="button"
                    onClick={() => openDefaultSite(site.url)}
                  >
                    <span
                      className="site-mark"
                      style={{ background: site.surface, color: site.accent }}
                    >
                      {site.shortName}
                    </span>
                    <span className="site-copy">
                      <strong>{site.name}</strong>
                      <small>{site.description}</small>
                    </span>
                    <span className="site-arrow">↗</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="sidebar-section">
            <div className="section-heading">
              <span>本地书架</span>
              <button type="button" onClick={importText}>
                <Icon name="plus" size={15} />
              </button>
            </div>
            <div className="library-list">
              {library.length === 0 ? (
                <button className="library-empty" type="button" onClick={importText}>
                  <Icon name="upload" />
                  <span>导入第一本 TXT</span>
                </button>
              ) : (
                library.map((item) => (
                  <div
                    className={`library-item ${document?.item.id === item.id ? 'active' : ''}`}
                    key={item.id}
                  >
                    <button type="button" onClick={() => openBook(item.id)}>
                      <span className="book-title">{item.title}</span>
                      <span className="book-progress">
                        {Math.round(item.progress * 100)}% · 本机
                      </span>
                      <span className="progress-track">
                        <span style={{ width: `${item.progress * 100}%` }} />
                      </span>
                    </button>
                    <button
                      aria-label={`移除 ${item.title}`}
                      className="remove-book"
                      type="button"
                      onClick={() => removeBook(item.id)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <button className="sidebar-update-button" type="button" onClick={showUpdates}>
          <Icon name="download" size={15} />
          {updates?.status === 'available' || updates?.status === 'downloaded'
            ? `新版本 v${updates.latest?.version}`
            : updates?.status === 'downloading' ? `下载中 ${updates.progress?.percent ?? 0}%` : '软件更新'}
        </button>

        <div className="privacy-card">
          <span className="privacy-dot" />
          <div>
            <strong>Local only</strong>
            <p>无需账号，不上传本地书籍</p>
          </div>
        </div>

        <div className="sidebar-actions">
          <IconButton
            className={`sidebar-settings-toggle ${showSettings ? 'active' : ''}`}
            icon="gear"
            label="设置"
            onClick={() => setShowSettings((value) => !value)}
          />
          <IconButton
            icon="minimize"
            label="最小化"
            onClick={() => void window.stealthReader.window.minimize()}
          />
          <IconButton
            icon="eye-off"
            label="立即隐藏"
            onClick={() => void window.stealthReader.window.hide()}
          />
          <IconButton
            className="media-visibility-toggle"
            disabled={settings.textOnlyWeb}
            icon="media-off"
            label={
              settings.textOnlyWeb
                ? '纯文字模式已隐藏媒体'
                : settings.hideWebMedia
                  ? '显示网页图片和视频'
                  : '隐藏网页图片和视频'
            }
            pressed={settings.hideWebMedia || settings.textOnlyWeb}
            onClick={() =>
              void updateSettings({ hideWebMedia: !settings.hideWebMedia })
            }
          />
          <IconButton
            className="text-only-toggle"
            icon="text-only"
            label={settings.textOnlyWeb ? '退出纯文字模式' : '开启纯文字模式'}
            pressed={settings.textOnlyWeb}
            onClick={() =>
              void updateSettings({ textOnlyWeb: !settings.textOnlyWeb })
            }
          />
          <IconButton
            className="sidebar-visibility-toggle"
            icon="droplet"
            label={settings.sidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
            pressed={settings.sidebarHidden}
            onClick={() =>
              void updateSettings({ sidebarHidden: !settings.sidebarHidden })
            }
          />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          {mode === 'browser' ? (
            <>
              <div className="tabs-row">
                <div className="tabs">
                  {browser.tabs.map((tab) => (
                    <button
                      className={`tab ${tab.id === browser.activeTabId ? 'active' : ''}`}
                      key={tab.id}
                      title={tab.title}
                      type="button"
                      onClick={() =>
                        window.stealthReader.browser.activate(tab.id).catch(reportError)
                      }
                    >
                      <span className={`loading-dot ${tab.loading ? 'active' : ''}`} />
                      <span>{tab.title || '新标签'}</span>
                      <span
                        aria-label="关闭标签"
                        className="tab-close"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          window.stealthReader.browser.close(tab.id).catch(reportError)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.stopPropagation()
                            window.stealthReader.browser.close(tab.id).catch(reportError)
                          }
                        }}
                      >
                        <Icon name="x" size={13} />
                      </span>
                    </button>
                  ))}
                </div>
                <IconButton
                  icon="plus"
                  label="新建标签"
                  onClick={() => window.stealthReader.browser.create().catch(reportError)}
                />
              </div>
              <form className="navigation-row" onSubmit={handleNavigate}>
                <IconButton
                  disabled={!activeTab?.canGoBack}
                  icon="arrow-left"
                  label="后退"
                  onClick={() => void window.stealthReader.browser.back()}
                />
                <IconButton
                  disabled={!activeTab?.canGoForward}
                  icon="arrow-right"
                  label="前进"
                  onClick={() => void window.stealthReader.browser.forward()}
                />
                <IconButton
                  icon="refresh"
                  label="刷新"
                  onClick={() => void window.stealthReader.browser.reload()}
                />
                <label className="address-field">
                  <span className="secure-indicator" />
                  <input
                    aria-label="网址或搜索"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </label>
                <div className="zoom-controls">
                  <IconButton
                    disabled={!activeTab || activeTab.zoomFactor <= 0.5}
                    icon="minimize"
                    label="缩小网页"
                    onClick={() =>
                      activeTab &&
                      window.stealthReader.browser
                        .setZoom(activeTab.zoomFactor - 0.1)
                        .catch(reportError)
                    }
                  />
                  <button
                    className="zoom-value"
                    disabled={!activeTab}
                    title="适应窗口"
                    type="button"
                    onClick={() =>
                      window.stealthReader.browser.setZoom(null).catch(reportError)
                    }
                  >
                    {Math.round((activeTab?.zoomFactor ?? 1) * 100)}%
                  </button>
                  <IconButton
                    disabled={!activeTab || activeTab.zoomFactor >= 1.5}
                    icon="plus"
                    label="放大网页"
                    onClick={() =>
                      activeTab &&
                      window.stealthReader.browser
                        .setZoom(activeTab.zoomFactor + 0.1)
                        .catch(reportError)
                    }
                  />
                </div>
                <span className="shortcut-hint">老板键 {settings.bossShortcut}</span>
              </form>
            </>
          ) : (
            <div className="reader-toolbar">
              <div>
                <span className="eyebrow">本地阅读</span>
                <strong>{document?.item.title ?? '书架'}</strong>
              </div>
              <label className="reader-search">
                <Icon name="search" size={16} />
                <input
                  placeholder="在全书中搜索"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery && <span>{searchMatchCount}</span>}
              </label>
              <button className="primary-button" type="button" onClick={importText}>
                <Icon name="upload" size={16} />
                导入 TXT
              </button>
            </div>
          )}
        </header>

        {showSettings ? (
          <section className="settings-panel">
            <div className="settings-copy">
              <p className="eyebrow">LOCAL PREFERENCES</p>
              <h1>把阅读空间调成你顺手的样子</h1>
              <p>所有设置都保存在本机。账号、会员和云同步不在当前版本中。</p>
            </div>
            <div className="settings-grid">
              {updates && <UpdatePanel state={updates} onState={setUpdates} />}
              <label className="setting-card setting-toggle">
                <div>
                  <strong>启动时检查更新</strong>
                  <span>从 GitHub 获取正式版本信息，不自动下载或安装</span>
                </div>
                <input checked={settings.checkUpdatesOnLaunch} type="checkbox"
                  onChange={(event) => void updateSettings({ checkUpdatesOnLaunch: event.target.checked })} />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>窗口始终置顶</strong>
                  <span>保持在普通应用窗口上方</span>
                </div>
                <input
                  checked={settings.alwaysOnTop}
                  type="checkbox"
                  onChange={(event) => void updateSettings({ alwaysOnTop: event.target.checked })}
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>收起顶部工具栏</strong>
                  <span>打开后保持收起，关闭后恢复；不跟踪鼠标</span>
                </div>
                <input
                  checked={settings.toolbarCollapsed}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ toolbarCollapsed: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>鼠标移出完全隐身</strong>
                  <span>鼠标离开窗口时降为 0%，移回原区域即恢复</span>
                </div>
                <input
                  checked={settings.hideWhenPointerLeaves}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ hideWhenPointerLeaves: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>隐藏左侧功能栏</strong>
                  <span>收起网页、阅读和常用站点，只保留水滴恢复按钮</span>
                </div>
                <input
                  checked={settings.sidebarHidden}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ sidebarHidden: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>隐藏网页图片和视频</strong>
                  <span>隐藏图片、背景图和视频画面，保留文字与页面布局</span>
                </div>
                <input
                  checked={settings.hideWebMedia}
                  disabled={settings.textOnlyWeb}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ hideWebMedia: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>纯文字透明模式</strong>
                  <span>网页与 TXT 仅保留文字，清除内容背景、边框与阴影</span>
                </div>
                <input
                  checked={settings.textOnlyWeb}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ textOnlyWeb: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>透明窗口外壳</strong>
                  <span>透明标题栏、侧栏、顶部工具栏、窗口阴影和网页滚动条</span>
                </div>
                <input
                  checked={settings.transparentAppChrome}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ transparentAppChrome: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card">
                <div className="setting-title">
                  <div>
                    <strong>窗口透明度</strong>
                    <span>最低保留 35%，避免窗口丢失</span>
                  </div>
                  <output>{Math.round(settings.opacity * 100)}%</output>
                </div>
                <input
                  max="1"
                  min="0.35"
                  step="0.05"
                  type="range"
                  value={settings.opacity}
                  onBlur={() => void updateSettings({ opacity: settings.opacity })}
                  onChange={(event) =>
                    setSettings({ ...settings, opacity: Number(event.target.value) })
                  }
                  onPointerUp={() => void updateSettings({ opacity: settings.opacity })}
                />
              </label>
              <ReaderTypographySettings settings={settings} onSave={updateSettings}
                onPreview={(patch) => setSettings((current) => current ? { ...current, ...patch } : current)} />
              <div className="setting-card">
                <div className="setting-title">
                  <div>
                    <strong>阅读主题</strong>
                    <span>仅影响本地文档</span>
                  </div>
                </div>
                <div className="theme-options">
                  {(['paper', 'green', 'dark'] as const).map((theme) => (
                    <button
                      aria-label={theme}
                      className={`${theme} ${settings.readerTheme === theme ? 'active' : ''}`}
                      key={theme}
                      type="button"
                      onClick={() => void updateSettings({ readerTheme: theme })}
                    />
                  ))}
                </div>
              </div>
              <label className="setting-card setting-wide">
                <div className="setting-title">
                  <div>
                    <strong>老板键</strong>
                    <span>隐藏后可从托盘或再次按下快捷键恢复</span>
                  </div>
                </div>
                <input
                  className="shortcut-input"
                  defaultValue={settings.bossShortcut}
                  onBlur={(event) =>
                    void updateSettings({ bossShortcut: event.target.value.trim() })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
              </label>
            </div>
          </section>
        ) : mode === 'browser' ? (
          <section ref={browserSurfaceRef} className="browser-surface">
            {browser.tabs.length === 0 && (
              <div className="empty-state">
                <p className="eyebrow">网页空间</p>
                <h2>新建一个标签开始浏览</h2>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => window.stealthReader.browser.create().catch(reportError)}
                >
                  <Icon name="plus" />
                  新建标签
                </button>
              </div>
            )}
          </section>
        ) : (
          document ? <ChapterReader
            key={`${document.item.id}:${document.item.lastOpenedAt}`}
            document={document}
            searchQuery={searchQuery}
            settings={settings}
            onProgress={saveProgress}
          /> : <div className="empty-state">
            <div className="empty-icon"><Icon name="book" size={30} /></div>
            <p className="eyebrow">本地阅读</p>
            <h2>选择一本书，安静读一会儿</h2>
            <p>导入 TXT 后自动识别卷与章节，章内滚动阅读，翻页切换章节。</p>
          </div>
        )}
      </main>

      {notice && (
        <button className="notice" type="button" onClick={() => setNotice(null)}>
          <span>{notice}</span>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  )
}
