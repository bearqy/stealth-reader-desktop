export interface TextChapter {
  id: string
  title: string
  start: number
  bodyStart: number
  end: number
}

const NUMBER = '[0-9０-９零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟]+'
const CHINESE_HEADING = new RegExp(`^第\\s*${NUMBER}\\s*[章节卷部回集篇](?![的地得])`)
const SPECIAL_HEADING = /^(?:序章|序言|前言|引子|楔子|后记|尾声|终章|完本感言|番外(?:篇|[0-9一二三四五六七八九十]+)?)(?:$|[\s：:、·—（(])/u
const ENGLISH_HEADING = /^(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+)(?:$|[\s.:：—–-])/i

function chapterTitle(line: string): string | null {
  const title = line.trim().replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '').trim()
  if (!title || title.length > 80 || /[。！？!?；;]/u.test(title)) return null
  return CHINESE_HEADING.test(title) || SPECIAL_HEADING.test(title) || ENGLISH_HEADING.test(title)
    ? title
    : null
}

// Keep offsets in the original text so imports retain their line endings and search positions.
export function parseTextChapters(content: string): TextChapter[] {
  const headings: Array<{ title: string; start: number; bodyStart: number }> = []
  for (const match of content.matchAll(/[^\r\n]+(?:\r\n?|\n|$)/g)) {
    const title = chapterTitle(match[0])
    if (title) {
      headings.push({ title, start: match.index, bodyStart: match.index + match[0].length })
    }
  }

  if (headings.length === 0) {
    return [{ id: 'chapter-0', title: '全文', start: 0, bodyStart: 0, end: content.length }]
  }

  const chapters: TextChapter[] = []
  const first = headings[0]!
  if (content.slice(0, first.start).trim()) {
    chapters.push({ id: 'chapter-0', title: '正文前言', start: 0, bodyStart: 0, end: first.start })
  }
  headings.forEach((heading, index) => {
    chapters.push({
      id: `chapter-${chapters.length}`,
      ...heading,
      // Include leading blank lines when there is no preface.
      start: index === 0 && chapters.length === 0 ? 0 : heading.start,
      end: headings[index + 1]?.start ?? content.length
    })
  })
  return chapters
}
