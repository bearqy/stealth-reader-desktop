import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LATEST_RELEASE_API } from '../src/main/update-policy'

const transport = vi.hoisted(() => ({
  fetch: vi.fn(),
  before: vi.fn(),
  completed: vi.fn(),
  failed: vi.fn(),
  partition: vi.fn()
}))
vi.mock('electron', () => ({ session: {
  fromPartition: transport.partition.mockImplementation(() => ({
    fetch: transport.fetch,
    webRequest: { onBeforeRequest: transport.before, onCompleted: transport.completed, onErrorOccurred: transport.failed }
  }))
} }))
import { createUpdateFetch } from '../src/main/update-network'

beforeEach(() => {
  transport.fetch.mockReset()
  transport.before.mockClear()
  transport.completed.mockClear()
  transport.failed.mockClear()
  transport.partition.mockClear()
})

describe('isolated Electron update transport', () => {
  it('follows redirects in an isolated non-cached session instead of Electron manual fetch', async () => {
    const response = new Response('installer')
    transport.fetch.mockResolvedValue(response)
    const fetch = createUpdateFetch()
    expect(transport.partition).toHaveBeenCalledWith('stealth-reader-updates', { cache: false })
    expect(await fetch('https://release-assets.githubusercontent.com/file', { redirect: 'manual', credentials: 'omit' })).toBe(response)
    expect(transport.fetch).toHaveBeenCalledWith(expect.any(String), { redirect: 'follow', credentials: 'omit' })
  })

  it('allows only the version endpoint and approved GitHub download hosts before any request is sent', () => {
    createUpdateFetch()
    const before = transport.before.mock.calls[0][0]
    for (const [url, allowed] of [
      [LATEST_RELEASE_API, true],
      ['https://github.com/bearqy/stealth-reader-desktop/releases/download/v0.2.0/a.dmg', true],
      ['https://release-assets.githubusercontent.com/file', true],
      ['https://example.org/redirect', false],
      ['http://release-assets.githubusercontent.com/file', false],
      ['https://api.github.com/user', false]
    ] as const) {
      const callback = vi.fn()
      before({ id: Math.random(), url }, callback)
      expect(callback).toHaveBeenCalledWith({ cancel: !allowed })
    }
  })

  it('limits redirect chains and removes tracking after completion or failure', () => {
    createUpdateFetch()
    const before = transport.before.mock.calls[0][0]
    const completed = transport.completed.mock.calls[0][0]
    const failed = transport.failed.mock.calls[0][0]
    const details = { id: 42, url: 'https://release-assets.githubusercontent.com/file' }
    for (let index = 0; index < 6; index += 1) {
      const callback = vi.fn()
      before(details, callback)
      expect(callback).toHaveBeenCalledWith({ cancel: false })
    }
    const denied = vi.fn()
    before(details, denied)
    expect(denied).toHaveBeenCalledWith({ cancel: true })
    completed(details)
    const fresh = vi.fn()
    before(details, fresh)
    expect(fresh).toHaveBeenCalledWith({ cancel: false })
    failed(details)
    const retry = vi.fn()
    before(details, retry)
    expect(retry).toHaveBeenCalledWith({ cancel: false })
  })
})
