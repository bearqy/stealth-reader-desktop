import { describe, expect, it } from 'vitest'
import { decodeTextBuffer } from '../src/main/text-reader'

describe('decodeTextBuffer', () => {
  it('decodes UTF-8 text', () => {
    const result = decodeTextBuffer(new TextEncoder().encode('安静阅读'))
    expect(result).toEqual({ content: '安静阅读', encoding: 'UTF-8' })
  })

  it('removes a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('正文')])
    expect(decodeTextBuffer(bytes)).toEqual({
      content: '正文',
      encoding: 'UTF-8 BOM'
    })
  })

  it('decodes UTF-16 little endian text', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00])
    expect(decodeTextBuffer(bytes)).toEqual({
      content: 'AB',
      encoding: 'UTF-16 LE'
    })
  })
})
