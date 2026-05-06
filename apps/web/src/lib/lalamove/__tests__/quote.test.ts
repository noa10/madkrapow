import { describe, expect, it } from 'vitest'
import { formatLalamoveCoordinate, moneyStringToCents, normalizePriceBreakdown } from '../quote'

describe('formatLalamoveCoordinate', () => {
  it('limits coordinates to eight decimal places for Lalamove requests', () => {
    expect(formatLalamoveCoordinate(3.1379440000000005)).toBe('3.13794400')
    expect(formatLalamoveCoordinate('101.52975699999999')).toBe('101.52975700')
  })

  it('rejects invalid coordinates', () => {
    expect(() => formatLalamoveCoordinate('not-a-number')).toThrow('Invalid coordinate')
  })
})

describe('moneyStringToCents', () => {
  it('converts MYR string amounts to integer cents', () => {
    expect(moneyStringToCents('18.48')).toBe(1848)
    expect(moneyStringToCents('50.5')).toBe(5050)
    expect(moneyStringToCents('0')).toBe(0)
  })
})

describe('normalizePriceBreakdown', () => {
  it('keeps Lalamove total as the charged delivery fee source', () => {
    expect(normalizePriceBreakdown({ total: '18.48', currency: 'MYR' })).toEqual({
      base: '18.48',
      total: '18.48',
      currency: 'MYR',
    })
  })
})
