/**
 * Guards the shared log sanitiser (CWE-117).
 *
 * Four routes previously carried byte-identical copies of a `sanitizeForLog`
 * that only stripped `\n`/`\r`, and a fifth sink (the GrabFood submit-order
 * webhook) had no sanitiser at all — CodeQL alert #57. These tests pin the
 * behaviour the call sites rely on, and cover the escape vectors the old
 * copies missed (ANSI sequences, C1 controls, Unicode line separators).
 */
import { describe, it, expect } from 'vitest'
import { sanitizeForLog, SANITIZE_FOR_LOG_MAX_LENGTH } from '../safe-log'

describe('sanitizeForLog', () => {
  it('removes line breaks so a crafted value cannot forge a log line', () => {
    expect(sanitizeForLog('Nasi\n[GrabFood] FORGED LINE')).toBe('Nasi[GrabFood] FORGED LINE')
    expect(sanitizeForLog('a\r\nb')).toBe('ab')
    expect(sanitizeForLog('a\rb')).toBe('ab')
  })

  it('never returns a string containing a line break', () => {
    const hostile = 'x\ny\rz\r\n\u2028w\u2029v\u0085u'
    const out = sanitizeForLog(hostile)
    expect(out).not.toMatch(/[\n\r\u2028\u2029\u0085]/)
  })

  it('strips ANSI escape sequences', () => {
    // Without this, a value could smuggle terminal control into CI logs.
    expect(sanitizeForLog('\u001b[31mRED\u001b[0m')).toBe('RED')
  })

  it('strips C0/C1 control characters', () => {
    expect(sanitizeForLog('a\u0000b\u0007c\u001bd')).toBe('abcd')
  })

  it('bounds the length of a logged value', () => {
    const long = 'a'.repeat(SANITIZE_FOR_LOG_MAX_LENGTH + 250)
    const out = sanitizeForLog(long)
    expect(out.length).toBeLessThanOrEqual(SANITIZE_FOR_LOG_MAX_LENGTH + 1)
    expect(out.startsWith('aaaa')).toBe(true)
  })

  it('honours an explicit max length', () => {
    expect(sanitizeForLog('abcdefghij', 4)).toBe('abcd…')
    expect(sanitizeForLog('abc', 4)).toBe('abc')
  })

  it('leaves ordinary text untouched', () => {
    expect(sanitizeForLog('order MK-1234 not found')).toBe('order MK-1234 not found')
  })

  it('accepts non-string values without throwing', () => {
    // `result.detail` is optional, and error fields are not always strings.
    expect(sanitizeForLog(undefined)).toBe('')
    expect(sanitizeForLog(null)).toBe('')
    expect(sanitizeForLog(42)).toBe('42')
    expect(sanitizeForLog({ a: 1 })).toBe('[object Object]')
    expect(sanitizeForLog(new Error('boom\nforged'))).toBe('Error: boomforged')
  })
})
