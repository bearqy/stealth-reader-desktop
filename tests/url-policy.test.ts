import { describe, expect, it } from 'vitest'
import { isAllowedNavigation, normalizeNavigationInput } from '../src/main/url-policy'

describe('normalizeNavigationInput', () => {
  it('adds HTTPS to host-like input', () => {
    expect(normalizeNavigationInput('example.com')).toBe('https://example.com/')
  })

  it('turns plain text into a search URL', () => {
    expect(normalizeNavigationInput('本地 阅读')).toBe(
      'https://www.bing.com/search?q=%E6%9C%AC%E5%9C%B0%20%E9%98%85%E8%AF%BB'
    )
  })

  it('rejects privileged protocols', () => {
    expect(() => normalizeNavigationInput('file:///etc/passwd')).toThrow(
      '仅允许访问 HTTP 或 HTTPS 地址'
    )
  })
})

describe('isAllowedNavigation', () => {
  it('allows HTTP and HTTPS', () => {
    expect(isAllowedNavigation('https://example.com')).toBe(true)
    expect(isAllowedNavigation('http://localhost:3000')).toBe(true)
  })

  it('rejects invalid and privileged URLs', () => {
    expect(isAllowedNavigation('javascript:alert(1)')).toBe(false)
    expect(isAllowedNavigation('not a url')).toBe(false)
  })
})
