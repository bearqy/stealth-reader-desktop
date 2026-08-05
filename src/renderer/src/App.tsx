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
  TextDocument
} from '../../shared/contracts'
import { DEFAULT_READING_SITES } from '../../shared/default-sites'

type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'book'
  | 'browser'
  | 'eye-off'
  | 'gear'
  | 'minimize'
  | 'plus'
  | 'refresh'
  | 'search'
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
  minimize: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 6v5h-5M4 18v-5h5M5.6 9a7 7 0 0 1 11.8-2.6L20 11M4 13l2.6 4.6A7 7 0 0 0 18.4 15" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
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
  disabled,
  onClick
}: {
  label: string
  icon: IconName
  disabled?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

interface MatchPart {
  text: string
  match: boolean
  index?: number
}

function buildHighlightedParts(content: string, query: string): MatchPart[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return [{ text: content, match: false }]

  const lower = content.toLocaleLowerCase()
  const parts: MatchPart[] = []
  let cursor = 0
  let matchIndex = 0
  while (matchIndex < 300) {
    const found = lower.indexOf(term, cursor)
    if (found < 0) break
    if (found > cursor) parts.push({ text: content.slice(cursor, found), match: false })
    parts.push({
      text: content.slice(found, found + term.length),
      match: true,
      index: matchIndex
    })
    cursor = found + term.length
    matchIndex += 1
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor), match: false })
  return parts
}

function ReaderView({
  document,
  settings,
  searchQuery,
  onProgress
}: {
  document: TextDocument | null
  settings: AppSettings
  searchQuery: string
  onProgress: (itemId: string, progress: number) => void
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<number | null>(null)
  const pendingProgressRef = useRef<number | null>(null)
  const parts = useMemo(
    () => buildHighlightedParts(document?.content ?? '', searchQuery),
    [document?.content, searchQuery]
  )

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || !document) return
    requestAnimationFrame(() => {
      const max = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
      scroll.scrollTop = max * document.item.progress
    })
  }, [document?.item.id])

  useEffect(() => {
    const itemId = document?.item.id
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      if (itemId && pendingProgressRef.current !== null) {
        onProgress(itemId, pendingProgressRef.current)
        pendingProgressRef.current = null
      }
    }
  }, [document?.item.id, onProgress])

  const handleScroll = (): void => {
    const scroll = scrollRef.current
    if (!scroll || !document) return
    const max = scroll.scrollHeight - scroll.clientHeight
    const progress = max > 0 ? scroll.scrollTop / max : 0
    const itemId = document.item.id
    pendingProgressRef.current = progress
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      onProgress(itemId, progress)
      pendingProgressRef.current = null
    }, 450)
  }

  if (!document) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Icon name="book" size={30} />
        </div>
        <p className="eyebrow">本地阅读</p>
        <h2>选择一本书，安静读一会儿</h2>
        <p>导入 TXT 后，内容和进度都只保存在这台电脑。</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={`reader-scroll theme-${settings.readerTheme}`}
      onScroll={handleScroll}
    >
      <article
        className="reader-page"
        style={{
          fontSize: `${settings.readerFontSize}px`,
          lineHeight: settings.readerLineHeight
        }}
      >
        <header className="reader-title">
          <span>{document.encoding}</span>
          <h1>{document.item.title}</h1>
        </header>
        <div className="reader-text">
          {parts.map((part, index) =>
            part.match ? (
              <mark id={`match-${part.index}`} key={`${index}-${part.text}`}>
                {part.text}
              </mark>
            ) : (
              part.text
            )
          )}
        </div>
      </article>
    </div>
  )
}

export function App(): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<AppMode>('browser')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [browser, setBrowser] = useState<BrowserState>({ tabs: [], activeTabId: null })
  const [address, setAddress] = useState('')
  const [document, setDocument] = useState<TextDocument | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [chromeCollapsed, setChromeCollapsed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const browserSurfaceRef = useRef<HTMLDivElement>(null)
  const collapseTimerRef = useRef<number | null>(null)

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
  }, [document, searchQuery])

  useEffect(() => {
    let mounted = true
    window.stealthReader
      .bootstrap()
      .then((initial) => {
        if (!mounted) return
        setSettings(initial.settings)
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
    return () => {
      mounted = false
      unsubscribe()
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
  }, [syncBrowserBounds, chromeCollapsed])

  useEffect(
    () => () => {
      void window.stealthReader.browser.setBounds({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        visible: false
      })
    },
    []
  )

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
    setChromeCollapsed(false)
    setAddress(url)
    window.stealthReader.browser.navigate(url).catch(reportError)
  }

  const importText = async (): Promise<void> => {
    try {
      const imported = await window.stealthReader.library.importText()
      if (!imported) return
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
    try {
      const next = await window.stealthReader.library.remove(itemId)
      setLibrary(next)
      if (document?.item.id === itemId) setDocument(null)
    } catch (error) {
      reportError(error)
    }
  }

  const saveProgress = useCallback((itemId: string, progress: number): void => {
    void window.stealthReader.library
      .updateProgress(itemId, progress)
      .then(setLibrary)
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : String(error))
      )
  }, [])

  const handlePointerLeave = (): void => {
    if (!settings?.collapseChromeOnBlur || mode !== 'browser') return
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = window.setTimeout(() => setChromeCollapsed(true), 700)
  }

  const revealChrome = (): void => {
    if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current)
    setChromeCollapsed(false)
  }

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
      className={`app-shell ${chromeCollapsed ? 'chrome-collapsed' : ''}`}
      onMouseLeave={handlePointerLeave}
    >
      <div className="chrome-reveal" onMouseEnter={revealChrome} />
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

        <div className="privacy-card">
          <span className="privacy-dot" />
          <div>
            <strong>Local only</strong>
            <p>无需账号，不上传本地书籍</p>
          </div>
        </div>

        <div className="sidebar-actions">
          <button
            className={showSettings ? 'active' : ''}
            type="button"
            onClick={() => setShowSettings((value) => !value)}
          >
            <Icon name="gear" />
            设置
          </button>
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
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar" onMouseEnter={revealChrome}>
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
                  placeholder="在当前文档中搜索"
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
                  <strong>鼠标移出收起工具栏</strong>
                  <span>顶部保留细条，移入即可恢复</span>
                </div>
                <input
                  checked={settings.collapseChromeOnBlur}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ collapseChromeOnBlur: event.target.checked })
                  }
                />
              </label>
              <label className="setting-card setting-toggle">
                <div>
                  <strong>失焦完全隐身</strong>
                  <span>切换到其他窗口时透明度降为 0%，聚焦后恢复</span>
                </div>
                <input
                  checked={settings.hideWhenUnfocused}
                  type="checkbox"
                  onChange={(event) =>
                    void updateSettings({ hideWhenUnfocused: event.target.checked })
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
              <label className="setting-card">
                <div className="setting-title">
                  <div>
                    <strong>阅读字号</strong>
                    <span>适用于 TXT 阅读器</span>
                  </div>
                  <output>{settings.readerFontSize}px</output>
                </div>
                <input
                  max="34"
                  min="12"
                  step="1"
                  type="range"
                  value={settings.readerFontSize}
                  onBlur={() =>
                    void updateSettings({ readerFontSize: settings.readerFontSize })
                  }
                  onChange={(event) =>
                    setSettings({ ...settings, readerFontSize: Number(event.target.value) })
                  }
                  onPointerUp={() =>
                    void updateSettings({ readerFontSize: settings.readerFontSize })
                  }
                />
              </label>
              <label className="setting-card">
                <div className="setting-title">
                  <div>
                    <strong>阅读行距</strong>
                    <span>紧凑或舒展都可以</span>
                  </div>
                  <output>{settings.readerLineHeight.toFixed(1)}</output>
                </div>
                <input
                  max="2.8"
                  min="1.2"
                  step="0.1"
                  type="range"
                  value={settings.readerLineHeight}
                  onBlur={() =>
                    void updateSettings({ readerLineHeight: settings.readerLineHeight })
                  }
                  onChange={(event) =>
                    setSettings({ ...settings, readerLineHeight: Number(event.target.value) })
                  }
                  onPointerUp={() =>
                    void updateSettings({ readerLineHeight: settings.readerLineHeight })
                  }
                />
              </label>
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
          <ReaderView
            document={document}
            searchQuery={searchQuery}
            settings={settings}
            onProgress={saveProgress}
          />
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
