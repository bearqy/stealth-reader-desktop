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
  readerFontSize: 20, readerFontFamily: 'sans', readerLetterSpacing: 0.04,
  readerLineHeight: 2, readerTheme: 'paper', checkUpdatesOnLaunch: false
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

it('applies the comfortable font and letter spacing to the reader', () => {
  const html = render()
  expect(html).toContain('PingFang SC')
  expect(html).toContain('Microsoft YaHei')
  expect(html).toContain('font-size:20px')
  expect(html).toContain('letter-spacing:0.04em')
  expect(html).toContain('line-height:2')
})

it('keeps a question/exclamation section out of the previous chapter and renders it when selected', () => {
  const text = '第三百六十二节：上一节\n前章独有正文。\n\n第三百六十三节：幽魂？幽魂！\n目标章独有正文。\n第三百六十四节：下一节\n后章独有正文。'
  const { chapters: sections } = parseTextBook(text)
  const renderSection = (index: number): string => renderToStaticMarkup(createElement(ChapterReader, {
    document: { content: text, encoding: 'UTF-8', item: { id: 'sections', title: '回归测试', fileName: 'sections.txt',
      progress: 0, lastOpenedAt: '', readerPosition: { chapterStart: sections[index]!.start, chapterProgress: 0 } } },
    settings, searchQuery: '', onProgress: () => undefined
  }))
  expect(renderSection(0)).not.toContain('目标章独有正文')
  expect(renderSection(0)).not.toContain('幽魂？幽魂！')
  expect(renderSection(1)).toContain('第三百六十三节：幽魂？幽魂！')
  expect(renderSection(1)).toContain('目标章独有正文')
  expect(renderSection(1)).not.toContain('前章独有正文')
  expect(renderSection(1)).not.toContain('后章独有正文')
})
