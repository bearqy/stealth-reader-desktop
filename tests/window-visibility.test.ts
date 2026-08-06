import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../src/shared/contracts'
import { resolveWindowOpacity } from '../src/main/window-visibility'

const settings: AppSettings = {
  alwaysOnTop: false,
  opacity: 0.65,
  hideWhenPointerLeaves: false,
  sidebarHidden: false,
  hideWebMedia: false,
  bossShortcut: 'CommandOrControl+Shift+H',
  collapseChromeOnBlur: true,
  readerFontSize: 18,
  readerLineHeight: 1.9,
  readerTheme: 'paper'
}

describe('resolveWindowOpacity', () => {
  it('keeps the configured opacity while the pointer is inside the window', () => {
    expect(resolveWindowOpacity({ ...settings, hideWhenPointerLeaves: true }, true)).toBe(0.65)
  })

  it('uses zero opacity when stealth mode is enabled and the pointer leaves', () => {
    expect(resolveWindowOpacity({ ...settings, hideWhenPointerLeaves: true }, false)).toBe(0)
  })

  it('keeps the configured opacity outside the window when stealth mode is disabled', () => {
    expect(resolveWindowOpacity(settings, false)).toBe(0.65)
  })
})
