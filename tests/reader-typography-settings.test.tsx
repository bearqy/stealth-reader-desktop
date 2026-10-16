import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { AppSettings } from '../src/shared/contracts'
import { DEFAULT_READER_TYPOGRAPHY } from '../src/shared/reader-typography'
import { ReaderTypographySettings } from '../src/renderer/src/ReaderTypographySettings'

const settings: AppSettings = {
  alwaysOnTop: false, opacity: 1, hideWhenPointerLeaves: false, sidebarHidden: false,
  hideWebMedia: false, textOnlyWeb: false, transparentAppChrome: false, bossShortcut: 'CommandOrControl+Shift+H',
  toolbarCollapsed: false, ...DEFAULT_READER_TYPOGRAPHY, readerTheme: 'paper', checkUpdatesOnLaunch: true
}

function render(current = settings): string {
  return renderToStaticMarkup(createElement(ReaderTypographySettings, {
    settings: current, onPreview: () => undefined, onSave: async () => undefined
  }))
}

it('exposes font choices, adjustable letter spacing and a live preview with reset', () => {
  const html = render()
  expect(html).toContain('阅读字体')
  expect(html).toContain('书香宋体')
  expect(html).toContain('系统楷体')
  expect(html).toContain('aria-label="阅读字距"')
  expect(html).toContain('aria-valuetext="0.8px"')
  expect(html).toContain('恢复推荐排版')
  expect(html).toContain('letter-spacing:0.04em')
  expect(html).toContain('不改变网页字体')
})

it('uses the selected font and spacing in the preview rather than hardcoded recommendations', () => {
  const html = render({ ...settings, readerFontFamily: 'serif', readerFontSize: 24, readerLetterSpacing: 0 })
  expect(html).toContain('Songti SC')
  expect(html).toContain('font-size:24px')
  expect(html).toContain('letter-spacing:0em')
  expect(html).toContain('aria-valuetext="0.0px"')
})
