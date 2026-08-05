import { describe, expect, it } from 'vitest'
import {
  clampBrowserZoom,
  DESKTOP_CONTENT_WIDTH,
  fitBrowserZoom
} from '../src/main/browser-zoom'

describe('browser zoom', () => {
  it('fits a narrow browser surface to the desktop content width', () => {
    expect(fitBrowserZoom(944)).toBe(0.8)
  })

  it('does not enlarge pages when the browser surface is already wide enough', () => {
    expect(fitBrowserZoom(DESKTOP_CONTENT_WIDTH + 200)).toBe(1)
  })

  it('uses normal zoom before a valid browser surface is available', () => {
    expect(fitBrowserZoom(0)).toBe(1)
  })

  it('clamps manual zoom to safe limits', () => {
    expect(clampBrowserZoom(0.1)).toBe(0.5)
    expect(clampBrowserZoom(3)).toBe(1.5)
  })

  it('normalizes zoom to five-percent steps', () => {
    expect(clampBrowserZoom(0.83)).toBe(0.85)
  })
})
