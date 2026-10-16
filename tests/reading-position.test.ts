import { describe, expect, it } from 'vitest'
import { parseTextBook } from '../src/shared/text-chapters'
import { readingPageCount, readingProgress, resolveReadingPosition, validReaderPosition } from '../src/shared/reading-position'

const content = '第一卷 起点\n第一章 初识\n' + '甲'.repeat(500) + '\n第二章 重逢\n' + '乙'.repeat(500)
const { chapters } = parseTextBook(content)

describe('chapter reading positions', () => {
  it('restores exact chapter and chapter-relative position across viewport changes', () => {
    expect(resolveReadingPosition(chapters, content.length, 0, {
      chapterStart: chapters[1].start, chapterProgress: 0.75
    })).toEqual({ chapter: 1, ratio: 0.75 })
  })

  it('maps legacy book percentages into a chapter without resetting to the start', () => {
    const result = resolveReadingPosition(chapters, content.length, 0.9)
    expect(result.chapter).toBe(1)
    expect(result.ratio).toBeGreaterThan(0.5)
    expect(resolveReadingPosition(chapters, content.length, 1).ratio).toBe(1)
  })

  it('clamps stale offsets when a source file was shortened', () => {
    expect(resolveReadingPosition(chapters, content.length, 0, { chapterStart: 100000, chapterProgress: 0.7 }))
      .toEqual({ chapter: 1, ratio: 1 })
  })

  it('handles empty text and invalid positions safely', () => {
    expect(resolveReadingPosition(parseTextBook('').chapters, 0, NaN)).toEqual({ chapter: 0, ratio: 0 })
    for (const value of [null, {}, { chapterStart: -1, chapterProgress: 0 }, { chapterStart: 1.5, chapterProgress: 0 },
      { chapterStart: 0, chapterProgress: NaN }, { chapterStart: 0, chapterProgress: 2 }]) expect(validReaderPosition(value)).toBe(false)
  })

  it('counts horizontal column pages without rounding up to a phantom page', () => {
    expect(readingPageCount(600, 600, 48)).toBe(1)
    expect(readingPageCount(600, 1248, 48)).toBe(2)
    expect(readingPageCount(600, 1249, 48)).toBe(2)
    expect(readingPageCount(600, 1896, 48)).toBe(3)
    expect(readingPageCount(0, 0, 48)).toBe(1)
  })

  it('records overall progress monotonically and reaches the final page', () => {
    const first = Array.from({ length: 4 }, (_, page) => readingProgress(chapters[0], content.length, page, 4))
    const second = Array.from({ length: 4 }, (_, page) => readingProgress(chapters[1], content.length, page, 4))
    const all = [...first, ...second]
    expect(all).toEqual([...all].sort((a, b) => a - b))
    expect(all.at(-1)).toBe(1)
  })
})
