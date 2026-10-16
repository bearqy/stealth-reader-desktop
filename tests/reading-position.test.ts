import { describe, expect, it } from 'vitest'
import { parseTextBook } from '../src/shared/text-chapters'
import { chapterScrollRatio, readingProgress, resolveReadingPosition, validReaderPosition } from '../src/shared/reading-position'

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

  it('tracks vertical chapter scrolling and clamps overscroll at both ends', () => {
    expect(chapterScrollRatio(0, 1600, 600)).toBe(0)
    expect(chapterScrollRatio(500, 1600, 600)).toBe(0.5)
    expect(chapterScrollRatio(1000, 1600, 600)).toBe(1)
    expect(chapterScrollRatio(-20, 1600, 600)).toBe(0)
    expect(chapterScrollRatio(1020, 1600, 600)).toBe(1)
  })

  it('treats a fully visible short chapter as read without a phantom scrollbar', () => {
    expect(chapterScrollRatio(0, 600, 600)).toBe(1)
    expect(chapterScrollRatio(0, 400, 600)).toBe(1)
  })

  it('records overall progress continuously and reaches the end of the final chapter', () => {
    const first = Array.from({ length: 5 }, (_, step) => readingProgress(chapters[0], content.length, step / 4))
    const second = Array.from({ length: 5 }, (_, step) => readingProgress(chapters[1], content.length, step / 4))
    const all = [...first, ...second]
    expect(all).toEqual([...all].sort((a, b) => a - b))
    expect(all.at(-1)).toBe(1)
    expect(readingProgress(chapters[1], content.length, 0)).toBeCloseTo(chapters[1].start / content.length)
    expect(readingProgress(chapters[1], content.length, NaN)).toBe(readingProgress(chapters[1], content.length, 0))
    expect(readingProgress(chapters[1], content.length, 5)).toBe(1)
    expect(readingProgress(chapters[0], 0, 1)).toBe(0)
  })
})
