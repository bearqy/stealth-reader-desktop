import type { AppSettings, ReaderFontFamily } from './contracts'

export const READER_FONTS: ReadonlyArray<{ id: ReaderFontFamily; label: string; family: string }> = [
  { id: 'sans', label: '舒适黑体（推荐）',
    family: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", sans-serif' },
  { id: 'serif', label: '书香宋体',
    family: '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif' },
  { id: 'kai', label: '系统楷体',
    family: '"Kaiti SC", "STKaiti", "KaiTi", "楷体", "PingFang SC", "Microsoft YaHei", sans-serif' }
]

export type ReaderTypography = Pick<AppSettings,
  'readerFontFamily' | 'readerFontSize' | 'readerLineHeight' | 'readerLetterSpacing'>

// A desktop reading preset, not a claim about the mobile Fanqie app's exact settings.
export const DEFAULT_READER_TYPOGRAPHY: ReaderTypography = {
  readerFontFamily: 'sans', readerFontSize: 20, readerLineHeight: 2, readerLetterSpacing: 0.04
}

export function readerFontFamily(value: unknown): ReaderFontFamily {
  return READER_FONTS.find((font) => font.id === value)?.id ?? DEFAULT_READER_TYPOGRAPHY.readerFontFamily
}

export function readerLetterSpacing(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(0.12, Math.max(0, value)) : DEFAULT_READER_TYPOGRAPHY.readerLetterSpacing
}

export function readerTypographyStyle(settings: ReaderTypography): {
  fontFamily: string; fontSize: string; lineHeight: number; letterSpacing: string
} {
  return {
    fontFamily: READER_FONTS.find((font) => font.id === readerFontFamily(settings.readerFontFamily))!.family,
    fontSize: `${settings.readerFontSize}px`,
    lineHeight: settings.readerLineHeight,
    letterSpacing: `${readerLetterSpacing(settings.readerLetterSpacing)}em`
  }
}
