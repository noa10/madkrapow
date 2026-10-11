import { describe, it, expect } from 'vitest'
import {
  EscPosBuilder,
  CHARS_PER_LINE,
  toAsciiSafe,
  wrapText,
  toBase64,
  fromBase64,
} from '../escpos'

function bytesOf(build: (b: EscPosBuilder) => void, charsPerLine?: 32 | 48): number[] {
  const builder = new EscPosBuilder(charsPerLine)
  build(builder)
  return Array.from(builder.toUint8Array())
}

describe('EscPosBuilder', () => {
  it('starts every job with ESC @ (initialize)', () => {
    const bytes = bytesOf(() => {})
    expect(bytes).toEqual([0x1b, 0x40])
  })

  it('emits alignment, bold and size commands before the text and LF', () => {
    const bytes = bytesOf((b) => {
      b.text('KITCHEN', { align: 'center', bold: true, double: true })
    })
    expect(bytes).toEqual([
      0x1b, 0x40, // init
      0x1b, 0x61, 0x01, // ESC a 1 (center)
      0x1b, 0x45, 0x01, // ESC E 1 (bold on)
      0x1d, 0x21, 0x11, // GS ! 0x11 (double)
      ...'KITCHEN'.split('').map((c) => c.charCodeAt(0)),
      0x0a, // LF
    ])
  })

  it('wraps long text to the paper width', () => {
    const bytes = bytesOf((b) => b.text('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII'), 32)
    // Wrapped into 32-char lines, each terminated by LF.
    const text = bytes.slice(2)
    const lfs = text.filter((b) => b === 0x0a).length
    expect(lfs).toBe(2)
  })

  it('renders a two-column money row with a right-aligned amount', () => {
    const bytes = bytesOf((b) => b.columns('Nasi Lemak', 'RM 12.50'), 32)
    // Strip init + the three style commands (ESC a n, ESC E n, GS ! n).
    const asText = bytes
      .slice(2 + 9)
      .map((b) => String.fromCharCode(b))
      .join('')
      .split('\n')[0]
    expect(asText).toMatch(/^Nasi Lemak\s+RM 12\.50$/)
    expect(asText.length).toBeLessThanOrEqual(32)
  })

  it('emits feed, cut and cash-drawer commands', () => {
    const bytes = bytesOf((b) => {
      b.feed(3)
      b.cut()
      b.openCashDrawer()
    })
    expect(bytes.slice(2)).toEqual([
      0x1b, 0x64, 0x03, // ESC d 3
      0x1d, 0x56, 0x42, 0x00, // GS V 66 0 (partial cut)
      0x1b, 0x70, 0x00, 0x19, 0xfa, // ESC p 0 25 250 (drawer kick)
    ])
  })

  it('supports 58mm (32 chars) and 80mm (48 chars) widths', () => {
    const b58 = new EscPosBuilder(CHARS_PER_LINE.W58)
    const b80 = new EscPosBuilder(CHARS_PER_LINE.W80)
    expect(b58.width).toBe(32)
    expect(b80.width).toBe(48)
  })
})

describe('toAsciiSafe', () => {
  it('passes printable ASCII through', () => {
    expect(toAsciiSafe('Nasi Lemak RM 12.50')).toBe('Nasi Lemak RM 12.50')
  })

  it('transliterates common typography and falls back to ?', () => {
    expect(toAsciiSafe('\u2018x\u2019 \u2013 \u00e9 \u4f60')).toBe("'x' - e ?")
  })
})

describe('wrapText', () => {
  it('wraps on word boundaries and hard-splits over-long words', () => {
    expect(wrapText('the quick brown fox', 10)).toEqual(['the quick', 'brown fox'])
    expect(wrapText('supercalifragilistic', 8)).toEqual([
      'supercal',
      'ifragili',
      'stic',
    ])
  })

  it('keeps explicit newlines', () => {
    expect(wrapText('a\nb', 10)).toEqual(['a', 'b'])
  })
})

describe('base64 transport', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0x1b, 0x40, 0x0a, 0xff])
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual([0x1b, 0x40, 0x0a, 0xff])
  })
})
