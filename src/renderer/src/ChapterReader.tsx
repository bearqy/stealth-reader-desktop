import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AppSettings, ReaderPosition, TextDocument } from '../../shared/contracts'
import { parseTextBook } from '../../shared/text-chapters'
import { readingPageCount, readingProgress, resolveReadingPosition } from '../../shared/reading-position'

const COLUMN_GAP = 48

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
  const [pagination, setPagination] = useState({ page: 0, pages: 1, ready: false })
  const viewport = useRef<HTMLDivElement>(null)
  const columns = useRef<HTMLDivElement>(null)
  const pageRef = useRef({ page: 0, pages: 1 })
  const pendingRatio = useRef<number | null>(initial.current.ratio)
  const searchTarget = useRef<number | null>(null)
  const chapter = book.chapters[chapterIndex]!
  const volume = book.volumes.find((candidate) => candidate.id === chapter.volumeId)
  const body = document.content.slice(chapter.bodyStart, chapter.end)
  const term = searchQuery.trim()
  const highlighted = useMemo(() => ({ body: highlightText(body, term),
    title: highlightText(chapter.title, term), volume: highlightText(volume?.title ?? '', term)
  }), [body, chapter.title, volume?.title, term])

  const jumpChapter = useCallback((index: number, ratio = 0): void => {
    if (index < 0 || index >= book.chapters.length) return
    pendingRatio.current = ratio
    if (index === chapterIndex) {
      const page = Math.round(ratio * Math.max(0, pageRef.current.pages - 1))
      pageRef.current.page = page
      if (viewport.current) viewport.current.scrollLeft = page * (viewport.current.clientWidth + COLUMN_GAP)
      setPagination({ ...pageRef.current, ready: true })
      pendingRatio.current = null
    } else {
      setPagination((current) => ({ ...current, ready: false }))
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
    // Only a changed query starts a new search, not ordinary page/chapter navigation.
  }, [term, document.content])

  useLayoutEffect(() => {
    const element = viewport.current
    const flow = columns.current
    if (!element || !flow) return
    let frame = 0
    let disposed = false
    const measure = (): void => {
      if (disposed || element.clientWidth === 0 || element.clientHeight === 0) return
      const ratio = pendingRatio.current ?? pageRef.current.page / Math.max(1, pageRef.current.pages - 1)
      // Keep column geometry integral so dozens of pages cannot accumulate subpixel drift.
      flow.style.width = `${element.clientWidth}px`
      flow.style.columnWidth = `${element.clientWidth}px`
      const pages = readingPageCount(element.clientWidth, element.scrollWidth, COLUMN_GAP)
      let page = Math.min(pages - 1, Math.max(0, Math.round(ratio * (pages - 1))))
      if (searchTarget.current === chapterIndex) {
        const mark = flow.querySelector('mark')
        if (mark) {
          const x = mark.getBoundingClientRect().left - element.getBoundingClientRect().left + element.scrollLeft
          page = Math.min(pages - 1, Math.max(0, Math.floor(x / (element.clientWidth + COLUMN_GAP))))
        }
        searchTarget.current = null
      }
      pendingRatio.current = null
      pageRef.current = { page, pages }
      element.scrollLeft = page * (element.clientWidth + COLUMN_GAP)
      setPagination({ page, pages, ready: true })
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    schedule()
    void window.document.fonts.ready.then(schedule)
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect() }
  }, [chapter.id, chapterIndex, term, settings.readerFontSize, settings.readerLineHeight,
    settings.transparentAppChrome, settings.textOnlyWeb])

  useEffect(() => {
    if (!pagination.ready) return
    onProgress(document.item.id, readingProgress(chapter, document.content.length, pagination.page, pagination.pages), {
      chapterStart: chapter.start,
      chapterProgress: pagination.page / Math.max(1, pagination.pages - 1)
    })
  }, [chapter, pagination.page, pagination.pages, pagination.ready, document.item.id, document.content.length, onProgress])

  const turnPage = (direction: -1 | 1): void => {
    if (!pagination.ready) return
    const page = pagination.page + direction
    if (page < 0) { jumpChapter(chapterIndex - 1, 1); return }
    if (page >= pagination.pages) { jumpChapter(chapterIndex + 1); return }
    pageRef.current = { page, pages: pagination.pages }
    if (viewport.current) viewport.current.scrollLeft = page * (viewport.current.clientWidth + COLUMN_GAP)
    setPagination({ ...pageRef.current, ready: true })
  }
  const groups = useMemo(() => {
    const groups = [
      { volume: undefined as typeof book.volumes[number] | undefined, chapters: [] as Array<typeof chapter & { index: number }> },
      ...book.volumes.map((volume) => ({ volume, chapters: [] as Array<typeof chapter & { index: number }> }))
    ]
    const byVolume = new Map(groups.map((group) => [group.volume?.id ?? null, group]))
    book.chapters.forEach((item, index) => byVolume.get(item.volumeId)?.chapters.push({ ...item, index }))
    return groups.filter((group) => group.chapters.length > 0)
  }, [book])
  const progress = readingProgress(chapter, document.content.length, pagination.page, pagination.pages)

  return (
    <div className="reader-layout" onKeyDown={(event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, summary')) return
      if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button')) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); turnPage(event.shiftKey ? -1 : 1) }
      if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); turnPage(-1) }
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
      <div className={`reader-scroll reader-paginated theme-${settings.readerTheme}`}>
        <article className="reader-page" style={{ fontSize: `${settings.readerFontSize}px`, lineHeight: settings.readerLineHeight }}>
          <header className="reader-book-label">{document.item.title}<span>第 {chapterIndex + 1} / {book.chapters.length} 章</span></header>
          <div className="reader-page-viewport" ref={viewport} tabIndex={0} aria-label="分页阅读区域"
            onClick={() => viewport.current?.focus({ preventScroll: true })}>
            <div className="reader-pages" ref={columns} style={{ columnGap: COLUMN_GAP }}>
              <section className="reader-chapter" data-chapter-id={chapter.id}>
                {volume && <p className="reader-volume-title">{highlighted.volume}</p>}
                <h2>{highlighted.title}</h2>
                <div className="reader-text">{body ? highlighted.body : <span className="directory-hint">本章暂无正文</span>}</div>
              </section>
            </div>
          </div>
        </article>
      </div>
      <footer className="reader-pagination" aria-label="阅读翻页">
        <button type="button" disabled={!pagination.ready || (chapterIndex === 0 && pagination.page === 0)} onClick={() => turnPage(-1)}>上一页</button>
        <span aria-live="polite">本章 {pagination.page + 1} / {pagination.pages} 页<span className="reader-book-progress"> · 全书 {Math.round(progress * 100)}%</span></span>
        <button type="button" disabled={!pagination.ready || (chapterIndex === book.chapters.length - 1 && pagination.page === pagination.pages - 1)}
          onClick={() => turnPage(1)}>{pagination.page === pagination.pages - 1 ? (chapterIndex === book.chapters.length - 1 ? '全书完' : '下一章 →') : '下一页'}</button>
      </footer>
      <div className="reader-key-hint">← → / PageUp PageDown / 空格翻页 · 章末自动衔接下一章</div>
    </div>
  )
}
