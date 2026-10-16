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

export function chapterScrollRatio(scrollTop: number, scrollHeight: number, viewportHeight: number): number {
  const range = Math.max(0, scrollHeight - viewportHeight)
  return range > 0 ? Math.max(0, Math.min(1, scrollTop / range)) : 1
}

export function readingProgress(chapter: Pick<ReadingChapter, 'start' | 'end'>, length: number, ratio: number): number {
  const position = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0
  return length > 0 ? Math.min(1, (chapter.start + (chapter.end - chapter.start) * position) / length) : 0
}
