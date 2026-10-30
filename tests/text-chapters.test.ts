import { describe, expect, it } from 'vitest'
import { parseTextBook, parseTextChapters } from '../src/shared/text-chapters'

describe('parseTextChapters', () => {
  it.each([
    '第三百六十三节：幽魂？幽魂！',
    '第363节: 幽魂?幽魂!',
    '第三百六十四章 为什么？！',
    '第365回 快走!!',
    '第366章难道是他？',
    '　　## 第３６７节：真的吗？ ##',
    'Chapter 368: Who?!',
    '番外：终于回来了！'
  ])('recognizes a punctuated heading without swallowing it into the previous chapter: %s', (heading) => {
    const text = `第三百六十二节：上一节\r\n前章正文。\r\n\r\n${heading}\r\n本章正文。\r\n第三百六十九节：下一节\r\n后章正文。`
    const chapters = parseTextChapters(text)
    expect(chapters).toHaveLength(3)
    expect(chapters[1].title).toContain(heading.includes('##') ? '第３６７节：真的吗？' : heading)
    expect(text.slice(chapters[0].bodyStart, chapters[0].end)).not.toContain('本章正文')
    expect(text.slice(chapters[1].bodyStart, chapters[1].end)).toBe('本章正文。\r\n')
    expect(chapters[1].start).toBe(text.indexOf(heading))
    expect(chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
  })

  it('still rejects prose questions/exclamations without valid chapter prefixes', () => {
    const text = '第一章 初见\n他喊道：“第三百六十三节：幽魂？幽魂！”\n第一章的故事，真的结束了吗？\n普通的感叹句！\n第二章 归来\n正文。'
    const chapters = parseTextChapters(text)
    expect(chapters.map((chapter) => chapter.title)).toEqual(['第一章 初见', '第二章 归来'])
    expect(text.slice(chapters[0].bodyStart, chapters[0].end)).toContain('普通的感叹句！')
  })

  it('recognizes Chinese chapter, volume and section headings with different numbers', () => {
    const content = '第一卷 起点\n卷简介\n第 １２ 章 雨夜\n正文\n第两百零三节归来\n结尾'
    const chapters = parseTextChapters(content)
    expect(chapters.map((chapter) => chapter.title)).toEqual([
      '第一卷 起点', '第 １２ 章 雨夜', '第两百零三节归来'
    ])
    expect(content.slice(chapters[1].bodyStart, chapters[1].end)).toBe('正文\n')
  })

  it('recognizes case-insensitive English and Markdown headings', () => {
    const chapters = parseTextChapters('# Chapter 1: Rain\nBody\n## CHAPTER IV — Home ##\nEnd')
    expect(chapters.map((chapter) => chapter.title)).toEqual(['Chapter 1: Rain', 'CHAPTER IV — Home'])
  })

  it('includes prologues, epilogues and extra chapters', () => {
    const chapters = parseTextChapters('楔子\n开头\n序章：往事\n故事\n番外一 重逢\n番外正文\n后记\n完')
    expect(chapters.map((chapter) => chapter.title)).toEqual(['楔子', '序章：往事', '番外一 重逢', '后记'])
  })

  it('retains a preface and every original character, including CRLF and blank lines', () => {
    const content = '书籍介绍\r\n\r\n　第一章 起点\r\n\r\n正文\r\n第二章 结尾\r\n结束'
    const chapters = parseTextChapters(content)
    expect(chapters[0].title).toBe('正文前言')
    expect(chapters.map((chapter) => content.slice(chapter.start, chapter.end)).join('')).toBe(content)
    expect(content.slice(chapters[1].bodyStart, chapters[1].end)).toBe('\r\n正文\r\n')
    expect(new Set(chapters.map((chapter) => chapter.id)).size).toBe(chapters.length)
  })

  it('preserves leading blank lines and supports CR-only files and a final heading without a newline', () => {
    const content = '\r\r第一章 雨夜\r正文\r第二章 天晴'
    const chapters = parseTextChapters(content)
    expect(chapters).toHaveLength(2)
    expect(chapters[0].start).toBe(0)
    expect(chapters[1].bodyStart).toBe(content.length)
    expect(chapters.map((chapter) => content.slice(chapter.start, chapter.end)).join('')).toBe(content)
  })

  it('does not interpret ordinary sentences or long paragraphs as headings', () => {
    const content = `第一章的故事还没有结束\n后记里还有一些说明\n第三章 他终于明白了一切。\n第四章 ${'很长的正文'.repeat(30)}`
    expect(parseTextChapters(content)).toEqual([
      { id: 'chapter-0', title: '全文', start: 0, bodyStart: 0, end: content.length }
    ])
  })

  it('provides full-text fallback for unstructured or empty files', () => {
    for (const content of ['', '普通段落\n没有章节标题']) {
      expect(parseTextChapters(content)).toEqual([
        { id: 'chapter-0', title: '全文', start: 0, bodyStart: 0, end: content.length }
      ])
    }
  })

  it('indexes a long book without dropping or overlapping chapter content', () => {
    const content = Array.from({ length: 2000 }, (_, index) => `第${index + 1}章 标题\n这是一段正文。\n`).join('')
    const chapters = parseTextChapters(content)
    expect(chapters).toHaveLength(2000)
    expect(chapters.map((chapter) => content.slice(chapter.start, chapter.end)).join('')).toBe(content)
  })
})

describe('parseTextBook', () => {
  it('separates the screenshot-style section headings inside a volume without losing blank lines', () => {
    const text = '第五卷 魔君纵横\n\n第三百六十二节：上一节\n前章正文。\n\n\n第三百六十三节：幽魂？幽魂！\n本章正文。\n\n第三百六十四节：下一节\n后章正文。'
    const book = parseTextBook(text)
    expect(book.chapters.map((chapter) => chapter.title)).toEqual([
      '第三百六十二节：上一节', '第三百六十三节：幽魂？幽魂！', '第三百六十四节：下一节'
    ])
    expect(book.chapters.every((chapter) => !chapter.generated && chapter.volumeId === book.volumes[0]?.id)).toBe(true)
    expect(text.slice(book.chapters[0].bodyStart, book.chapters[0].end)).not.toContain('第三百六十三节')
    expect(book.chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
  })

  it('recognizes a large sequence of mixed punctuated section titles rather than merging alternate chapters', () => {
    const text = Array.from({ length: 2200 }, (_, i) => `第${i + 1}节：${i % 2 ? '幽魂？幽魂！' : '普通标题'}\n本章正文。\n\n`).join('')
    const chapters = parseTextBook(text).chapters
    expect(chapters).toHaveLength(2200)
    expect(chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
  })

  it('groups chapters under volumes without adding blank volume pages', () => {
    const text = '书籍说明\n第一卷 初来\n\n第一章 风起\n甲\n第二章 相逢\n乙\n第二卷 远行\n第三章 出发\n丙'
    const book = parseTextBook(text)
    expect(book.volumes.map((volume) => volume.title)).toEqual(['第一卷 初来', '第二卷 远行'])
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['正文前言', '第一章 风起', '第二章 相逢', '第三章 出发'])
    expect(book.chapters.map((chapter) => chapter.volumeId)).toEqual([null, book.volumes[0].id, book.volumes[0].id, book.volumes[1].id])
    expect(book.chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
  })

  it('keeps volume introductions as readable pages and recognizes volume-first and English headings', () => {
    const text = '卷一 风雨\r\n卷首说明\r\n第一章 启程\r\n甲\r\nVolume II: Home\r\nChapter 2: Return\r\nEnd'
    const book = parseTextBook(text)
    expect(book.volumes.map((volume) => volume.title)).toEqual(['卷一 风雨', 'Volume II: Home'])
    expect(book.chapters).toHaveLength(3)
    expect(text.slice(book.chapters[0].bodyStart, book.chapters[0].end)).toContain('卷首说明')
    expect(book.chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
  })

  it('automatically segments unstructured text without dropping characters, CRLF or surrogate halves', () => {
    for (const text of ['普通段落\r\n'.repeat(5000), '文'.repeat(5999) + '😀' + '字'.repeat(15000)]) {
      const book = parseTextBook(text)
      expect(book.chapters.length).toBeGreaterThan(2)
      expect(book.chapters.every((chapter) => chapter.generated)).toBe(true)
      expect(book.chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
      for (const chapter of book.chapters.slice(1)) {
        expect(text[chapter.start]).not.toMatch(/[\uDC00-\uDFFF]/)
        expect(text.slice(chapter.start - 1, chapter.start + 1)).not.toBe('\r\n')
      }
    }
  })

  it('preserves a final volume heading and all empty/short content', () => {
    for (const text of ['', '第一卷 起点', '第一卷 起点\n第二卷 结尾', '短文本']) {
      const book = parseTextBook(text)
      expect(book.chapters.length).toBeGreaterThan(0)
      expect(book.chapters.map((chapter) => text.slice(chapter.start, chapter.end)).join('')).toBe(text)
    }
  })

  it('does not split a recognized long chapter into artificial chapters', () => {
    const book = parseTextBook('第一章 正文\n' + '长章节正文。'.repeat(10000))
    expect(book.chapters).toHaveLength(1)
    expect(book.chapters[0].generated).toBe(false)
  })

  it('accepts a body prefix but does not treat sentences about volumes as volume covers', () => {
    expect(parseTextBook('正文 第一章 初见\n正文\n正文 第二章 重逢\n结束').chapters.map((chapter) => chapter.title))
      .toEqual(['第一章 初见', '第二章 重逢'])
    expect(parseTextBook('第一卷的故事还没有结束\n普通正文').volumes).toEqual([])
  })
})
