import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function normalizeNavigationInput(input: string): string {
  const trimmed = input.trim()

  if (!trimmed) {
    return 'https://www.bing.com/'
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : trimmed.includes('.') && !trimmed.includes(' ')
      ? `https://${trimmed}`
      : `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`

  const parsed = new URL(withProtocol)
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('仅允许访问 HTTP 或 HTTPS 地址')
  }

  return parsed.toString()
}

export function isAllowedNavigation(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export function isTrustedRendererNavigation(
  targetUrl: string,
  developmentUrl?: string,
  productionFile?: string
): boolean {
  try {
    const target = new URL(targetUrl)
    if (developmentUrl) {
      const expected = new URL(developmentUrl)
      return (
        ALLOWED_PROTOCOLS.has(expected.protocol) &&
        ALLOWED_PROTOCOLS.has(target.protocol) &&
        target.origin === expected.origin
      )
    }

    if (!productionFile) return false
    return (
      target.protocol === 'file:' &&
      resolve(fileURLToPath(target)) === resolve(productionFile)
    )
  } catch {
    return false
  }
}
