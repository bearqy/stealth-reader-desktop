import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  isAllowedNavigation,
  isIgnorableLoadError,
  isTrustedRendererNavigation,
  normalizeNavigationInput
} from '../src/main/url-policy'

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

describe('isIgnorableLoadError', () => {
  it('ignores an aborted load after a safe redirect', () => {
    expect(
      isIgnorableLoadError(
        { code: 'ERR_ABORTED', message: 'navigation interrupted' },
        'https://fanqienovel.com/?force_mobile=1'
      )
    ).toBe(true)
  })

  it('does not hide unrelated or unsafe failures', () => {
    expect(
      isIgnorableLoadError(
        { code: 'ERR_CERT_INVALID' },
        'https://example.com/'
      )
    ).toBe(false)
    expect(
      isIgnorableLoadError(
        { code: 'ERR_ABORTED' },
        'file:///tmp/private.txt'
      )
    ).toBe(false)
  })
})

describe('isTrustedRendererNavigation', () => {
  it('allows only the configured development origin', () => {
    expect(
      isTrustedRendererNavigation(
        'http://localhost:5173/settings',
        'http://localhost:5173/'
      )
    ).toBe(true)
    expect(
      isTrustedRendererNavigation('https://example.com/', 'http://localhost:5173/')
    ).toBe(false)
  })

  it('allows only the configured production file', () => {
    const productionFile = resolve('test fixtures/阅读器/out/renderer/index.html')
    const target = pathToFileURL(productionFile)
    target.hash = 'reader'
    expect(
      isTrustedRendererNavigation(
        target.href,
        undefined,
        productionFile
      )
    ).toBe(true)
    expect(
      isTrustedRendererNavigation(
        pathToFileURL(resolve('test fixtures/阅读器/other.html')).href,
        undefined,
        productionFile
      )
    ).toBe(false)
  })
})
