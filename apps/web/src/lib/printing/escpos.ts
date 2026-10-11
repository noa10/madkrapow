/**
 * ESC/POS thermal-printer byte generator (Hubbo POS blueprint, TS port).
 *
 * Pure, dependency-free and DOM-free: builders produce a Uint8Array suitable
 * for raw TCP (port 9100), USB or Bluetooth transports. Paper widths map to
 * the 32 / 42 / 48 characters-per-line the Hubbo app supports (58 mm / 80 mm).
 *
 * Supported command subset (v1):
 *   ESC @      initialize          ESC a n   alignment
 *   ESC E n    bold on/off         GS ! n    character size
 *   ESC d n    feed n lines        GS V 66 0 partial cut with feed
 *   ESC p      cash-drawer kick    LF        line feed
 *
 * Text is ASCII-safe: characters outside printable ASCII pass through a
 * small transliteration map and fall back to '?' — thermal charsets vary by
 * vendor, so we stay deterministic.
 */

export const CHARS_PER_LINE = { W58: 32, W80: 48 } as const
export type CharsPerLine = (typeof CHARS_PER_LINE)[keyof typeof CHARS_PER_LINE]

export type Alignment = 'left' | 'center' | 'right'

export interface TextStyle {
  align?: Alignment
  bold?: boolean
  /** Double width + double height (GS ! 0x11). */
  double?: boolean
}

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

// Common Unicode → printable-ASCII fallbacks (receipts are Malaysian English;
// anything unmapped becomes '?').
const TRANSLITERATE: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u00a0': ' ',
  '\u00e9': 'e',
  '\u00e8': 'e',
  '\u00ea': 'e',
  '\u00e0': 'a',
  '\u00e2': 'a',
  '\u00fc': 'u',
  '\u00f6': 'o',
  '\u00b0': '*',
  '\u2022': '*',
  '\u2212': '-',
  '\u00d7': 'x',
}

export function toAsciiSafe(text: string): string {
  let out = ''
  for (const char of text) {
    if (char === '\n' || char === '\t') {
      out += char
      continue
    }
    const code = char.codePointAt(0) ?? 63
    if (code >= 0x20 && code <= 0x7e) {
      out += char
    } else {
      out += TRANSLITERATE[char] ?? '?'
    }
  }
  return out
}

/** Word-wrap to a column width; over-long words are hard-split. */
export function wrapText(text: string, width: number): string[] {
  const lines: string[] = []
  for (const rawLine of toAsciiSafe(text).split('\n')) {
    const produced: string[] = []
    let current = ''
    for (const word of rawLine.split(/\s+/).filter(Boolean)) {
      if (word.length > width) {
        if (current) {
          produced.push(current)
          current = ''
        }
        for (let i = 0; i < word.length; i += width) {
          produced.push(word.slice(i, i + width))
        }
        continue
      }
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > width) {
        produced.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) produced.push(current)
    // An empty raw line is a deliberate blank line; keep it.
    lines.push(...(produced.length > 0 ? produced : ['']))
  }
  return lines
}

function alignmentByte(align: Alignment): number {
  return align === 'center' ? 1 : align === 'right' ? 2 : 0
}

export class EscPosBuilder {
  private readonly bytes: number[] = []
  private readonly charsPerLine: CharsPerLine

  constructor(charsPerLine: CharsPerLine = CHARS_PER_LINE.W80) {
    this.charsPerLine = charsPerLine
    // ESC @ — start every job from a clean printer state.
    this.bytes.push(ESC, 0x40)
  }

  get width(): number {
    return this.charsPerLine
  }

  /** Append raw command bytes (escape hatch for transport-specific commands). */
  raw(...byte: number[]): this {
    this.bytes.push(...byte)
    return this
  }

  /** Write a styled text run, wrapping to the paper width; always ends with LF. */
  text(text: string, style: TextStyle = {}): this {
    const align = style.align ?? 'left'
    this.bytes.push(ESC, 0x61, alignmentByte(align))
    this.bytes.push(ESC, 0x45, style.bold ? 1 : 0)
    this.bytes.push(GS, 0x21, style.double ? 0x11 : 0x00)
    const width = this.charsPerLine
    for (const line of wrapText(text, width)) {
      for (let i = 0; i < line.length; i++) {
        this.bytes.push(line.charCodeAt(i))
      }
      this.bytes.push(LF)
    }
    return this
  }

  /** Centered divider across the full width. */
  divider(fill = '-'): this {
    return this.text(fill.repeat(this.charsPerLine))
  }

  /**
   * One two-column row: label left, value right-aligned. Long labels wrap and
   * continuation lines align under the label column.
   */
  columns(label: string, value: string, style: TextStyle = {}): this {
    const align = style.align ?? 'left'
    this.bytes.push(ESC, 0x61, alignmentByte(align))
    this.bytes.push(ESC, 0x45, style.bold ? 1 : 0)
    this.bytes.push(GS, 0x21, style.double ? 0x11 : 0x00)

    const valueAscii = toAsciiSafe(value)
    const labelWidth = Math.max(1, this.charsPerLine - valueAscii.length - 1)
    const labelLines = wrapText(label, labelWidth)
    labelLines.forEach((line, index) => {
      const right = index === labelLines.length - 1 ? valueAscii : ''
      const row = `${line.padEnd(labelWidth)}${right ? ` ${right}` : ''}`.slice(
        0,
        this.charsPerLine
      )
      for (let i = 0; i < row.length; i++) {
        this.bytes.push(row.charCodeAt(i))
      }
      this.bytes.push(LF)
    })
    return this
  }

  /** Blank line. */
  lineFeed(count = 1): this {
    for (let i = 0; i < count; i++) this.bytes.push(LF)
    return this
  }

  /** ESC d n — print and feed n lines. */
  feed(count = 3): this {
    this.bytes.push(ESC, 0x64, count)
    return this
  }

  /** GS V 66 0 — partial cut after feeding. */
  cut(): this {
    this.bytes.push(GS, 0x56, 0x42, 0x00)
    return this
  }

  /** ESC p 0 25 250 — kick the cash drawer (pin 2). */
  openCashDrawer(): this {
    this.bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa)
    return this
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

/** Encode a byte array as base64 (JSON transport to the print bridge). */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Decode base64 back to bytes (bridge side). */
export function fromBase64(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
