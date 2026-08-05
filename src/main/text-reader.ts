import { readFile, stat } from 'node:fs/promises'

const MAX_TEXT_FILE_BYTES = 32 * 1024 * 1024

export interface DecodedText {
  content: string
  encoding: string
}

export async function readTextFile(filePath: string): Promise<DecodedText> {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    throw new Error('所选路径不是文件')
  }
  if (fileStat.size > MAX_TEXT_FILE_BYTES) {
    throw new Error('当前 MVP 支持最大 32MB 的 TXT 文件')
  }

  return decodeTextBuffer(await readFile(filePath))
}

export function decodeTextBuffer(buffer: Uint8Array): DecodedText {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      content: new TextDecoder('utf-8').decode(buffer.subarray(3)),
      encoding: 'UTF-8 BOM'
    }
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return {
      content: new TextDecoder('utf-16le').decode(buffer.subarray(2)),
      encoding: 'UTF-16 LE'
    }
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return {
      content: new TextDecoder('utf-16be').decode(buffer.subarray(2)),
      encoding: 'UTF-16 BE'
    }
  }

  try {
    return {
      content: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      encoding: 'UTF-8'
    }
  } catch {
    return {
      content: new TextDecoder('gb18030').decode(buffer),
      encoding: 'GB18030'
    }
  }
}
