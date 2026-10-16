import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ReaderPosition, TextDocument } from '../../shared/contracts'
import { parseTextBook } from '../../shared/text-chapters'
import { chapterScrollRatio, readingProgress, resolveReadingPosition } from '../../shared/reading-position'
import { readerTypographyStyle } from '../../shared/reader-typography'

function highlightText(text: string, term: string): React.ReactNode {
  if (!term) return text
  const pieces: React.ReactNode[] = []
  const lower = text.toLocaleLowerCase()
  const query = term.toLocaleLowerCase()
  let cursor = 0
  for (let count = 0; count < 300; count++) {
    const offset = lower.indexOf(query, cursor)
    if (offset < 0) break
    pieces.push(text.slice(cursor, offset), <mark key={offset}>{text.slice(offset, offset + term.length)}</mark>)
    cursor = offset + term.length
  }
  pieces.push(text.slice(cursor))
  return pieces
}

export function ChapterReader({ document, settings, searchQuery, onProgress }: {
  document: TextDocument
  settings: AppSettings
  searchQuery: string
  onProgress: (id: string, progress: number, position: ReaderPosition) => void
}): React.JSX.Element {
  const book = useMemo(() => parseTextBook(document.content), [document.content])
  const initial = useRef(resolveReadingPosition(book.chapters, document.content.length,
    document.item.progress, document.item.readerPosition))
  const [chapterIndex, setChapterIndex] = useState(initial.current.chapter)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [scrollRatio, setScrollRatio] = useState(initial.current.ratio)
  const viewport = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLElement>(null)
  const ratioRef = useRef(initial.current.ratio)
  const pendingRatio = useRef<number | null>(initial.current.ratio)
  const searchTarget = useRef<number | null>(null)
  const measureRef = useRef<(() => void) | null>(null)
  const layoutRef = useRef<{ width: number; height: number; scrollHeight: number } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshot = useRef<{ chapterStart: number; chapterEnd: number; ratio: number } | null>(null)
  const progressCallback = useRef(onProgress)
  progressCallback.current = onProgress
  const chapter = book.chapters[chapterIndex]!
  const volume = book.volumes.find((candidate) => candidate.id === chapter.volumeId)
  const body = document.content.slice(chapter.bodyStart, chapter.end)
  const term = searchQuery.trim()
  const highlighted = useMemo(() => ({ body: highlightText(body, term),
    title: highlightText(chapter.title, term), volume: highlightText(volume?.title ?? '', term)
  }), [body, chapter.title, volume?.title, term])

  const persist = useCallback((): void => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const position = snapshot.current
    if (!position) return
    progressCallback.current(document.item.id,
      readingProgress({ start: position.chapterStart, end: position.chapterEnd },
        document.content.length, position.ratio),
      { chapterStart: position.chapterStart, chapterProgress: position.ratio })
  }, [document.item.id, document.content.length])

  // Debounce disk/IPC writes while scrolling, but flush the last position on unmount.
  useEffect(() => {
    window.addEventListener('beforeunload', persist)
    return () => { window.removeEventListener('beforeunload', persist); persist() }
  }, [persist])

  const recordPosition = useCallback((): void => {
    const element = viewport.current
    if (!element) return
    const ratio = chapterScrollRatio(element.scrollTop, element.scrollHeight, element.clientHeight)
    ratioRef.current = ratio
    snapshot.current = { chapterStart: chapter.start, chapterEnd: chapter.end, ratio }
    setScrollRatio(ratio)
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(persist, 200)
  }, [chapter, persist])

  const jumpChapter = useCallback((index: number): void => {
    if (index < 0 || index >= book.chapters.length) return
    pendingRatio.current = 0
    if (index === chapterIndex) {
      measureRef.current?.()
    } else {
      setChapterIndex(index)
    }
    setDirectoryOpen(false)
  }, [book, chapterIndex])

  // A full-book query can jump to a different chapter; render/highlight only that chapter.
  useEffect(() => {
    if (!term) return
    const index = book.chapters.findIndex((candidate) =>
      document.content.slice(candidate.start, candidate.end).toLocaleLowerCase().includes(term.toLocaleLowerCase()))
    if (index < 0) return
    searchTarget.current = index
    jumpChapter(index)
    // Only a changed query starts a new search, not ordinary scrolling/chapter navigation.
  }, [term, document.content])

  useLayoutEffect(() => {
    const element = viewport.current
    const flow = article.current
    if (!element || !flow) return
    let frame = 0
    let disposed = false
    const measure = (): void => {
      if (disposed || element.clientWidth === 0 || element.clientHeight === 0) return
      const metrics = { width: element.clientWidth, height: element.clientHeight, scrollHeight: element.scrollHeight }
      const previous = layoutRef.current
      const resized = !previous || previous.width !== metrics.width || previous.height !== metrics.height
        || previous.scrollHeight !== metrics.scrollHeight
      const ratio = pendingRatio.current ?? ratioRef.current
      const range = Math.max(0, element.scrollHeight - element.clientHeight)
      // Initial ResizeObserver/font notifications must not undo a just-started scroll.
      let top = pendingRatio.current !== null || resized ? ratio * range : element.scrollTop
      if (searchTarget.current === chapterIndex) {
        const mark = flow.querySelector('mark')
        if (mark) {
          top = mark.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 24
        }
        searchTarget.current = null
      }
      pendingRatio.current = null
      layoutRef.current = metrics
      element.scrollTop = Math.max(0, Math.min(range, top))
      recordPosition()
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    observer.observe(flow)
    measureRef.current = measure
    measure()
    void window.document.fonts.ready.then(schedule)
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); measureRef.current = null }
  }, [chapter.id, chapterIndex, term, settings.readerFontSize, settings.readerLineHeight,
    settings.readerFontFamily, settings.readerLetterSpacing,
    settings.transparentAppChrome, settings.textOnlyWeb, recordPosition])
  const groups = useMemo(() => {
    const groups = [
      { volume: undefined as typeof book.volumes[number] | undefined, chapters: [] as Array<typeof chapter & { index: number }> },
      ...book.volumes.map((volume) => ({ volume, chapters: [] as Array<typeof chapter & { index: number }> }))
    ]
    const byVolume = new Map(groups.map((group) => [group.volume?.id ?? null, group]))
    book.chapters.forEach((item, index) => byVolume.get(item.volumeId)?.chapters.push({ ...item, index }))
    return groups.filter((group) => group.chapters.length > 0)
  }, [book])
  const progress = readingProgress(chapter, document.content.length, scrollRatio)

  return (
    <div className="reader-layout" onKeyDown={(event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, summary, [contenteditable="true"]')) return
      if (event.altKey || event.ctrlKey || event.metaKey || directoryOpen) return
      if (event.key === 'ArrowRight') { event.preventDefault(); jumpChapter(chapterIndex + 1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); jumpChapter(chapterIndex - 1) }
    }}>
      <div className="reader-chapter-controls">
        <button className="chapter-directory-toggle" type="button" aria-controls="reader-directory"
          aria-expanded={directoryOpen} onClick={() => setDirectoryOpen((open) => !open)}>
          目录 <span>{book.volumes.length ? `${book.volumes.length} 卷 · ` : ''}{book.chapters.length} 章</span>
        </button>
        <span className="current-chapter" title={[volume?.title, chapter.title].filter(Boolean).join(' / ')}>
          {volume && <span className="reader-volume-label">{volume.title} / </span>}{chapter.title}
        </span>
        <button className="chapter-nav-button" type="button" disabled={chapterIndex === 0} onClick={() => jumpChapter(chapterIndex - 1)}>上一章</button>
        <button className="chapter-nav-button" type="button" disabled={chapterIndex === book.chapters.length - 1} onClick={() => jumpChapter(chapterIndex + 1)}>下一章</button>
      </div>
      {directoryOpen && (
        <nav className="reader-directory" id="reader-directory" aria-label="章节目录" onKeyDown={(event) => {
          if (event.key === 'Escape') setDirectoryOpen(false)
        }}>
          <div className="directory-heading"><strong>分卷目录 · {book.chapters.length} 章</strong>
            <button className="chapter-nav-button" type="button" aria-label="关闭目录" onClick={() => setDirectoryOpen(false)}>关闭</button></div>
          {chapter.generated && <p className="directory-hint">未识别到章节标题，已按段落自动分段。</p>}
          <div className="chapter-list">
            {groups.map((group) => (
              <details className="volume-group" key={group.volume?.id ?? 'ungrouped'} open>
                <summary>{group.volume?.title ?? (book.volumes.length ? '卷前 / 未分卷' : '正文')}<span>{group.chapters.length} 章</span></summary>
                {group.chapters.map((item) => (
                  <button key={item.id} type="button" title={item.title}
                    aria-current={item.index === chapterIndex ? 'location' : undefined} onClick={() => jumpChapter(item.index)}>
                    {item.title}
                  </button>
                ))}
              </details>
            ))}
          </div>
        </nav>
      )}
      <div className={`reader-scroll reader-chapter-scroll theme-${settings.readerTheme}`} ref={viewport}
        tabIndex={0} aria-label="当前章节阅读区域" onScroll={() => {
          const element = viewport.current
          const previous = layoutRef.current
          if (pendingRatio.current !== null || !element) return
          if (previous && (previous.width !== element.clientWidth || previous.height !== element.clientHeight
            || previous.scrollHeight !== element.scrollHeight)) measureRef.current?.()
          else recordPosition()
        }} onClick={() => viewport.current?.focus({ preventScroll: true })}>
        <article className="reader-page" ref={article} style={readerTypographyStyle(settings)}>
          <header className="reader-book-label">{document.item.title}<span>第 {chapterIndex + 1} / {book.chapters.length} 章</span></header>
          <section className="reader-chapter" data-chapter-id={chapter.id}>
            {volume && <p className="reader-volume-title">{highlighted.volume}</p>}
            <h2>{highlighted.title}</h2>
            <div className="reader-text">{body ? highlighted.body : <span className="directory-hint">本章暂无正文</span>}</div>
          </section>
        </article>
      </div>
      <footer className="reader-chapter-navigation" aria-label="章节翻页">
        <button type="button" disabled={chapterIndex === 0} onClick={() => jumpChapter(chapterIndex - 1)}>上一章</button>
        <span>第 {chapterIndex + 1} / {book.chapters.length} 章 · 本章 {Math.round(scrollRatio * 100)}%<span className="reader-book-progress"> · 全书 {Math.round(progress * 100)}%</span></span>
        <button type="button" disabled={chapterIndex === book.chapters.length - 1}
          onClick={() => jumpChapter(chapterIndex + 1)}>{chapterIndex === book.chapters.length - 1 ? '全书完' : '下一章'}</button>
      </footer>
      <div className="reader-key-hint">章内上下滚动 · ← → 切换章节 · PageUp / PageDown / 空格滚动正文</div>
    </div>
  )
}
