import { describe, expect, it } from 'vitest'

import { formatMoney } from '../money'

describe('formatMoney', () => {
  it('formats whole and fractional cents with two decimals', () => {
    expect(formatMoney(0)).toBe('RM 0.00')
    expect(formatMoney(1)).toBe('RM 0.01')
    expect(formatMoney(99)).toBe('RM 0.99')
    expect(formatMoney(100)).toBe('RM 1.00')
    expect(formatMoney(1250)).toBe('RM 12.50')
  })

  it('formats values that would round on display', () => {
    expect(formatMoney(1255)).toBe('RM 12.55')
    expect(formatMoney(123456)).toBe('RM 1234.56')
  })

  it('formats negative amounts (refunds / adjustments)', () => {
    expect(formatMoney(-1)).toBe('RM -0.01')
    expect(formatMoney(-1250)).toBe('RM -12.50')
  })

  it('never renders "RM NaN" for missing or non-finite input', () => {
    expect(formatMoney(null)).toBe('RM 0.00')
    expect(formatMoney(undefined)).toBe('RM 0.00')
    expect(formatMoney(Number.NaN)).toBe('RM 0.00')
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('RM 0.00')
    expect(formatMoney(Number.NEGATIVE_INFINITY)).toBe('RM 0.00')
  })

  it('formats large amounts without scientific notation', () => {
    expect(formatMoney(999_999_999)).toBe('RM 9999999.99')
    expect(formatMoney(123_456_789)).toBe('RM 1234567.89')
  })

  it('always renders a finite RM string', () => {
    for (const input of [0, 1, 99, 100, 1250, -1250, null, undefined, Number.NaN]) {
      expect(formatMoney(input)).toMatch(/^RM -?\d+\.\d{2}$/)
    }
  })
})
