import { describe, expect, it } from 'vitest'
import { isKitchenActive, KITCHEN_QUEUE_OR_FILTER } from '../kitchen'
import { generateOrderNumber } from '../order-number'

describe('isKitchenActive', () => {
  it('includes the kitchen working statuses', () => {
    for (const status of ['paid', 'accepted', 'preparing', 'ready']) {
      expect(isKitchenActive({ status })).toBe(true)
    }
  })

  it('includes pending dine-in table orders so the kitchen starts immediately', () => {
    expect(isKitchenActive({ status: 'pending', delivery_type: 'dine_in' })).toBe(true)
  })

  it('includes pending POS counter orders (pay-later, including take-away)', () => {
    expect(
      isKitchenActive({ status: 'pending', delivery_type: 'self_pickup', source: 'counter' })
    ).toBe(true)
    expect(
      isKitchenActive({ status: 'pending', delivery_type: 'dine_in', source: 'counter' })
    ).toBe(true)
  })

  it('excludes abandoned web checkouts', () => {
    expect(isKitchenActive({ status: 'pending', delivery_type: 'delivery' })).toBe(false)
    expect(isKitchenActive({ status: 'pending', delivery_type: 'self_pickup' })).toBe(false)
    expect(
      isKitchenActive({ status: 'pending', delivery_type: 'delivery', source: 'web' })
    ).toBe(false)
    expect(isKitchenActive({ status: 'pending' })).toBe(false)
  })

  it('excludes terminal statuses', () => {
    for (const status of ['picked_up', 'delivered', 'cancelled']) {
      expect(isKitchenActive({ status, delivery_type: 'dine_in' })).toBe(false)
    }
  })

  it('exposes a PostgREST filter matching the predicate', () => {
    expect(KITCHEN_QUEUE_OR_FILTER).toContain('status.in.(paid,accepted,preparing,ready)')
    expect(KITCHEN_QUEUE_OR_FILTER).toContain(
      'and(status.eq.pending,delivery_type.eq.dine_in)'
    )
    expect(KITCHEN_QUEUE_OR_FILTER).toContain(
      'and(status.eq.pending,source.eq.counter)'
    )
  })
})

describe('generateOrderNumber', () => {
  it('is deterministic for injected time and randomness', () => {
    expect(generateOrderNumber(1_700_000_000_000, () => 0.123456)).toBe(
      generateOrderNumber(1_700_000_000_000, () => 0.123456)
    )
  })

  it('starts with MK and carries a four-character suffix', () => {
    const value = generateOrderNumber(1_700_000_000_000, () => 0.5)
    expect(value).toMatch(/^MK[0-9A-Z]{9,}$/)
    expect(value.length).toBeGreaterThan(6)
  })
})
