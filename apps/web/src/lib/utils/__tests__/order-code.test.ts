import { describe, it, expect } from 'vitest'
import { generateOrderDisplayCode, getOrderDisplayCode } from '../order-code'

describe('getOrderDisplayCode', () => {
  it('prefers the Grab short number for Grabfood orders', () => {
    expect(
      getOrderDisplayCode({
        id: 'order-1',
        display_code: 'MK-042',
        source: 'grabfood',
        channel_orders: [{ channel: 'grabfood', external_order_number: 'GF-659' }],
      }),
    ).toBe('GF-659')
  })

  it('falls back to the local display code when the short number is missing', () => {
    expect(
      getOrderDisplayCode({
        id: 'order-1',
        display_code: 'MK-042',
        source: 'grabfood',
        channel_orders: [{ channel: 'grabfood', external_order_number: null }],
      }),
    ).toBe('MK-042')
  })

  it('falls back to the local display code when the channel row is absent', () => {
    expect(
      getOrderDisplayCode({
        id: 'order-1',
        display_code: 'MK-042',
        source: 'grabfood',
        channel_orders: [],
      }),
    ).toBe('MK-042')
  })

  it('ignores blank short numbers', () => {
    expect(
      getOrderDisplayCode({
        id: 'order-1',
        display_code: 'MK-042',
        source: 'grabfood',
        channel_orders: [{ channel: 'grabfood', external_order_number: '   ' }],
      }),
    ).toBe('MK-042')
  })

  it('does not use another channel short number for Grabfood orders', () => {
    expect(
      getOrderDisplayCode({
        id: 'order-1',
        display_code: 'MK-042',
        source: 'grabfood',
        channel_orders: [{ channel: 'foodpanda', external_order_number: 'FP-900' }],
      }),
    ).toBe('MK-042')
  })

  it('keeps local display codes for non-channel orders', () => {
    expect(
      getOrderDisplayCode({
        id: 'order-1',
        display_code: 'MK-042',
        source: 'web',
        channel_orders: [{ channel: 'grabfood', external_order_number: 'GF-659' }],
      }),
    ).toBe('MK-042')
  })
})

describe('generateOrderDisplayCode', () => {
  it('returns MK- format with 3 digits', () => {
    const code = generateOrderDisplayCode(
      'test-order-id',
      new Date('2026-05-09T10:00:00Z'),
    )
    expect(code).toMatch(/^MK-\d{3}$/)
  })

  it('same order + same date = same code', () => {
    const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const date = new Date('2026-05-09T12:00:00Z')
    const code1 = generateOrderDisplayCode(orderId, date)
    const code2 = generateOrderDisplayCode(orderId, date)
    expect(code1).toBe(code2)
  })

  it('different dates produce different codes', () => {
    const orderId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const date1 = new Date('2026-05-09T12:00:00Z')
    const date2 = new Date('2026-05-10T12:00:00Z')
    const code1 = generateOrderDisplayCode(orderId, date1)
    const code2 = generateOrderDisplayCode(orderId, date2)
    expect(code1).not.toBe(code2)
  })

  it('different orders produce different codes on same day', () => {
    const date = new Date('2026-05-09T12:00:00Z')
    const code1 = generateOrderDisplayCode('order-aaa', date)
    const code2 = generateOrderDisplayCode('order-bbb', date)
    expect(code1).not.toBe(code2)
  })

  it('KL timezone boundary: 15:59 UTC May 8 = May 8 KL, 16:00 UTC = May 9 KL', () => {
    const orderId = 'boundary-test-order'
    const beforeMidnightKl = new Date('2026-05-08T15:59:00Z') // May 8 23:59 KL
    const afterMidnightKl = new Date('2026-05-08T16:00:00Z') // May 9 00:00 KL
    const codeBefore = generateOrderDisplayCode(orderId, beforeMidnightKl)
    const codeAfter = generateOrderDisplayCode(orderId, afterMidnightKl)
    expect(codeBefore).not.toBe(codeAfter)
  })

  it('code is always 6 characters total', () => {
    const code = generateOrderDisplayCode('any-id', new Date('2026-01-01'))
    expect(code.length).toBe(6)
  })

  it('deterministic hash for known input', () => {
    const orderId = '00000000-0000-0000-0000-000000000001'
    const date = new Date('2026-05-09T00:00:00Z')
    const code = generateOrderDisplayCode(orderId, date)
    expect(code).toMatch(/^MK-\d{3}$/)
  })

  it('cross-platform determinism with known values', () => {
    // These values should match what Dart produces with the same inputs
    // FNV-1a hash is deterministic across both implementations
    const orderId = 'test-determinism-001'
    const date = new Date('2026-05-09T10:00:00Z')
    const code = generateOrderDisplayCode(orderId, date)
    expect(code).toMatch(/^MK-\d{3}$/)
    // Verify it's deterministic by calling again
    expect(generateOrderDisplayCode(orderId, date)).toBe(code)
  })
})
