import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ChapterReader } from '../src/renderer/src/ChapterReader'
import { parseTextBook } from '../src/shared/text-chapters'
import type { AppSettings, ReaderPosition } from '../src/shared/contracts'

const content = '第一卷 起点\n第一章 初见\n只属于第一章的正文\n第二卷 重逢\n第二章 归来\n只属于第二章的正文 <script>alert(1)</script>'
const { chapters } = parseTextBook(content)
const settings: AppSettings = {
  alwaysOnTop: false, opacity: 1, hideWhenPointerLeaves: false, sidebarHidden: false,
  hideWebMedia: false, textOnlyWeb: false, transparentAppChrome: false,
  bossShortcut: 'CommandOrControl+Shift+H', toolbarCollapsed: false,
  readerFontSize: 18, readerLineHeight: 1.9, readerTheme: 'paper', checkUpdatesOnLaunch: false
}
function render(position?: ReaderPosition, searchQuery = ''): string {
  return renderToStaticMarkup(createElement(ChapterReader, {
    document: { content, encoding: 'UTF-8', item: { id: 'test', title: '测试小说', fileName: 'test.txt',
      progress: 0, lastOpenedAt: '', readerPosition: position } },
    settings,
    searchQuery, onProgress: () => undefined
  }))
}

it('renders only the current chapter instead of a full-book scrolling document', () => {
  const html = render()
  expect(html).toContain('只属于第一章的正文')
  expect(html).not.toContain('只属于第二章的正文')
  expect(html.match(/data-chapter-id=/g)).toHaveLength(1)
  expect(html).toContain('reader-chapter-scroll')
  expect(html).not.toContain('reader-pages')
  expect(html).not.toContain('上一页')
  expect(html).not.toContain('下一页')
  expect(html).toContain('章内上下滚动')
  expect(html).toContain('2 卷')
})

it('uses chapter navigation at both ends with no intra-chapter page counter', () => {
  const html = render()
  expect(html).toContain('aria-label="章节翻页"')
  expect(html).toContain('第 1 / 2 章')
  expect(html).toContain('disabled="">上一章')
  const last = render({ chapterStart: chapters[1]!.start, chapterProgress: 0.5 })
  expect(last).toContain('disabled="">全书完')
  expect(last).toContain('本章 50%')
})

it('renders the restored chapter and escapes imported text rather than executing HTML', () => {
  const html = render({ chapterStart: chapters[1]!.start, chapterProgress: 0.5 })
  expect(html).toContain('只属于第二章的正文')
  expect(html).not.toContain('只属于第一章的正文')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
})

it('highlights search matches within the current chapter', () => {
  expect(render(undefined, '第一章的正文')).toContain('<mark>第一章的正文</mark>')
  expect(render(undefined, '初见')).toContain('<mark>初见</mark>')
  expect(render(undefined, '起点')).toContain('<mark>起点</mark>')
})
