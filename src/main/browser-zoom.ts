export const MIN_BROWSER_ZOOM = 0.5
export const MAX_BROWSER_ZOOM = 1.5
export const DESKTOP_CONTENT_WIDTH = 1180

export function clampBrowserZoom(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(MAX_BROWSER_ZOOM, Math.max(MIN_BROWSER_ZOOM, Math.round(value * 20) / 20))
}

export function fitBrowserZoom(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  return clampBrowserZoom(Math.min(1, width / DESKTOP_CONTENT_WIDTH))
}
