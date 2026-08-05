import { describe, expect, it } from 'vitest'
import { DEFAULT_READING_SITES } from '../src/shared/default-sites'

describe('DEFAULT_READING_SITES', () => {
  it('contains the expected default services', () => {
    expect(DEFAULT_READING_SITES.map((site) => site.id)).toEqual([
      'weread',
      'douyin',
      'bilibili',
      'xiaohongshu',
      'fenbi',
      'fanqie',
      'jjwxc'
    ])
  })

  it('uses unique IDs and secure URLs', () => {
    const ids = new Set(DEFAULT_READING_SITES.map((site) => site.id))
    const urls = new Set(DEFAULT_READING_SITES.map((site) => site.url))

    expect(ids.size).toBe(DEFAULT_READING_SITES.length)
    expect(urls.size).toBe(DEFAULT_READING_SITES.length)
    for (const site of DEFAULT_READING_SITES) {
      expect(new URL(site.url).protocol).toBe('https:')
    }
  })
})
