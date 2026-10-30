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
const VOLUME_HEADING = new RegExp(`^(?:第\\s*${NUMBER}\\s*[卷部篇]|[卷部篇]\\s*${NUMBER}|[上中下][卷部篇])(?![的地得])`)
const ENGLISH_VOLUME = /^(?:part|book|volume)\s+(?:\d+|[ivxlcdm]+)(?:$|[\s.:：—–-])/i

function chapterTitle(line: string): string | null {
  const title = line.trim().replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '').replace(/^正文[\s：:]+/, '').trim()
  // Questions/exclamations are common in real titles (e.g. 第363节：幽魂？幽魂！).
  // Keep sentence/length guards, but let the explicit heading patterns decide these lines.
  if (!title || title.length > 80 || /[。；;]/u.test(title)) return null
  return CHINESE_HEADING.test(title) || VOLUME_HEADING.test(title) || SPECIAL_HEADING.test(title) || ENGLISH_HEADING.test(title) || ENGLISH_VOLUME.test(title)
    ? title
    : null
}

export interface ReadingChapter extends TextChapter {
  volumeId: string | null
  generated: boolean
}

export interface TextVolume {
  id: string
  title: string
}

export interface TextBook {
  chapters: ReadingChapter[]
  volumes: TextVolume[]
}

// Split only unstructured books. Keep original offsets and avoid breaking CRLF/surrogate pairs.
function splitUnstructured(content: string): ReadingChapter[] {
  const chapters: ReadingChapter[] = []
  let start = 0
  do {
    let end = Math.min(start + 6000, content.length)
    if (end < content.length) {
      const window = content.slice(start + 4000, end)
      const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('\r'))
      if (boundary >= 0) end = start + 4000 + boundary + 1
      else {
        const sentence = Math.max(window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？'))
        if (sentence >= 0) end = start + 4000 + sentence + 1
      }
      if (content[end - 1] === '\r' && content[end] === '\n') end++
      if (/[\uD800-\uDBFF]/.test(content[end - 1] ?? '')) end--
    }
    chapters.push({ id: `segment-${start}`, title: `自动分段 ${chapters.length + 1}`,
      start, bodyStart: start, end, volumeId: null, generated: true })
    start = end
  } while (start < content.length)
  return chapters
}

export function parseTextBook(content: string): TextBook {
  const parsed = parseTextChapters(content)
  if (parsed.length === 1 && parsed[0]!.bodyStart === 0) {
    return { chapters: splitUnstructured(content), volumes: [] }
  }
  const volumes: TextVolume[] = []
  const chapters: ReadingChapter[] = []
  let volumeId: string | null = null
  let pendingStart: number | null = null
  for (const [index, chapter] of parsed.entries()) {
    if (VOLUME_HEADING.test(chapter.title) || ENGLISH_VOLUME.test(chapter.title)) {
      volumeId = `volume-${chapter.start}`
      volumes.push({ id: volumeId, title: chapter.title })
      // An empty volume cover belongs to its first chapter, not an extra blank reading page.
      if (!content.slice(chapter.bodyStart, chapter.end).trim() && index < parsed.length - 1) {
        pendingStart ??= chapter.start
        continue
      }
    }
    chapters.push({ ...chapter, id: `reading-${chapter.start}`,
      start: pendingStart ?? chapter.start, volumeId, generated: false })
    pendingStart = null
  }
  return { chapters, volumes }
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
