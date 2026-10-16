import { describe, expect, it } from 'vitest'
import { DEFAULT_READER_TYPOGRAPHY, READER_FONTS, readerFontFamily, readerLetterSpacing, readerTypographyStyle } from '../src/shared/reader-typography'

describe('TXT reader typography', () => {
  it('defaults to local sans fonts and relaxed spacing without downloading fonts', () => {
    const style = readerTypographyStyle(DEFAULT_READER_TYPOGRAPHY)
    expect(style.fontFamily).toContain('PingFang SC')
    expect(style.fontFamily).toContain('Microsoft YaHei')
    expect(style).toMatchObject({ fontSize: '20px', lineHeight: 2, letterSpacing: '0.04em' })
    expect(READER_FONTS.every((font) => !font.family.includes('url('))).toBe(true)
  })

  it('keeps serif and Kai styles selectable with local fallbacks', () => {
    expect(readerTypographyStyle({ ...DEFAULT_READER_TYPOGRAPHY, readerFontFamily: 'serif' }).fontFamily).toContain('Songti SC')
    expect(readerTypographyStyle({ ...DEFAULT_READER_TYPOGRAPHY, readerFontFamily: 'kai' }).fontFamily).toContain('KaiTi')
    expect(readerFontFamily('url(https://example.com/font.woff)')).toBe('sans')
    expect(readerFontFamily(undefined)).toBe('sans')
  })

  it('preserves zero spacing and clamps invalid settings safely', () => {
    expect(readerLetterSpacing(0)).toBe(0)
    expect(readerLetterSpacing(-1)).toBe(0)
    expect(readerLetterSpacing(1)).toBe(0.12)
    for (const value of [NaN, Infinity, -Infinity, null, undefined, '0.08']) {
      expect(readerLetterSpacing(value)).toBe(0.04)
    }
    expect(readerTypographyStyle({ ...DEFAULT_READER_TYPOGRAPHY, readerLetterSpacing: 0 }).letterSpacing).toBe('0em')
  })
})
