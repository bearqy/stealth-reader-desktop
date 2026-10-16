import type { ReaderPosition } from './contracts'
import type { ReadingChapter } from './text-chapters'

export function validReaderPosition(value: unknown): value is ReaderPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as ReaderPosition
  return Number.isSafeInteger(position.chapterStart) && position.chapterStart >= 0
    && Number.isFinite(position.chapterProgress) && position.chapterProgress >= 0 && position.chapterProgress <= 1
}

export function resolveReadingPosition(chapters: ReadingChapter[], length: number,
  progress: number, position?: ReaderPosition): { chapter: number; ratio: number } {
  const offset = validReaderPosition(position) ? position.chapterStart
    : Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * length
  const found = chapters.findIndex((chapter) => offset < chapter.end)
  const chapter = found >= 0 ? found : Math.max(0, chapters.length - 1)
  const current = chapters[chapter]!
  const ratio = validReaderPosition(position) && current.start === position.chapterStart
    ? position.chapterProgress : Math.min(1, Math.max(0, (offset - current.start) / Math.max(1, current.end - current.start)))
  return { chapter, ratio }
}

export function readingPageCount(width: number, scrollWidth: number, gap: number): number {
  return width > 0 ? Math.max(1, Math.ceil((scrollWidth + gap - 1) / (width + gap))) : 1
}

export function readingProgress(chapter: ReadingChapter, length: number, page: number, pages: number): number {
  return length > 0 ? Math.min(1, (chapter.start + (chapter.end - chapter.start) * (page + 1) / Math.max(1, pages)) / length) : 0
}
