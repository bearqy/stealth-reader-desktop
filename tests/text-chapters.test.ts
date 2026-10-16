import { describe, expect, it } from 'vitest'
import { parseTextChapters } from '../src/shared/text-chapters'

describe('parseTextChapters', () => {
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
