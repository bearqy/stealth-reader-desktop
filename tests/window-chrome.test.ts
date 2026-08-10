import { describe, expect, it } from 'vitest'
import {
  shouldHideWindowOnClose,
  windowChromeOptions,
  windowsTitleBarOverlay
} from '../src/main/window-chrome'

describe('window chrome', () => {
  it('uses a transparent Windows surface while preserving the title bar controls', () => {
    expect(windowChromeOptions('win32', true)).toEqual({
      transparent: true,
      backgroundColor: '#00000000',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#26372e',
        height: 30
      },
      autoHideMenuBar: true
    })
  })

  it('restores the opaque Windows title bar overlay when transparency is disabled', () => {
    expect(windowsTitleBarOverlay(false).color).toBe('#f7f9f6')
  })

  it('keeps the existing macOS transparent window configuration', () => {
    expect(windowChromeOptions('darwin', false)).toMatchObject({
      transparent: true,
      backgroundColor: '#00000000',
      titleBarStyle: 'hiddenInset',
      titleBarOverlay: false,
      autoHideMenuBar: false
    })
  })

  it('allows Windows close requests to terminate the application', () => {
    expect(shouldHideWindowOnClose('win32', false)).toBe(false)
  })

  it('only converts a normal macOS close request into a hide action', () => {
    expect(shouldHideWindowOnClose('darwin', false)).toBe(true)
    expect(shouldHideWindowOnClose('darwin', true)).toBe(false)
  })
})
