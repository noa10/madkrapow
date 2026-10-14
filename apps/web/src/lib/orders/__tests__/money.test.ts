import { describe, expect, it } from 'vitest'

import { formatMoney, orderSubtotalCents, orderTotalCents } from '../money'

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

describe('orderTotalCents', () => {
  /**
   * An order row whose columns hold a real persisted shape: subtotal 1250 +
   * fee 400 = total 1650. The fee is carried deliberately — it is the thing a
   * caller must *not* add, so every assertion here would change if the helper
   * started summing it back in.
   *
   * Fixtures go through a factory rather than inline literals because the
   * helper's parameter is `{ total_cents }`, so an inline literal carrying
   * `delivery_fee_cents` is an excess-property error. That is deliberate: the
   * narrow signature is what stops a call site from hand-rolling the sum again.
   */
  type MoneyFixture = {
    subtotal_cents: number
    delivery_fee_cents: number
    discount_cents: number
    total_cents: number | null | undefined
  }

  const order = (overrides: Partial<MoneyFixture> = {}): MoneyFixture => ({
    subtotal_cents: 1250,
    delivery_fee_cents: 400,
    discount_cents: 0,
    total_cents: 1650,
    ...overrides,
  })

  it('returns the paid total as-is, without adding the delivery fee', () => {
    expect(orderTotalCents(order())).toBe(1650)
  })

  it('does not double-count the fee (the regression this guards)', () => {
    const doubleCounted = 1650 + 400
    expect(doubleCounted).toBe(2050)
    expect(orderTotalCents(order())).toBe(1650)
    expect(orderTotalCents(order())).not.toBe(doubleCounted)
  })

  it('treats a fee-inclusive discounted total as the amount owed', () => {
    // subtotal 2000 + fee 500 - discount 300 = 2200
    const discounted = order({
      subtotal_cents: 2000,
      delivery_fee_cents: 500,
      discount_cents: 300,
      total_cents: 2200,
    })
    expect(orderTotalCents(discounted)).toBe(2200)
  })

  it('leaves self-pickup orders (no fee) unchanged', () => {
    expect(orderTotalCents(order({ delivery_fee_cents: 0, total_cents: 1250 }))).toBe(1250)
  })

  it('reads a bare total_cents object', () => {
    expect(orderTotalCents({ total_cents: 0 })).toBe(0)
    expect(orderTotalCents({ total_cents: 999_999 })).toBe(999_999)
  })

  it('falls back to 0 for missing or non-finite totals', () => {
    expect(orderTotalCents({ total_cents: null })).toBe(0)
    expect(orderTotalCents({ total_cents: undefined })).toBe(0)
    expect(orderTotalCents({ total_cents: Number.NaN })).toBe(0)
    expect(orderTotalCents({ total_cents: Number.POSITIVE_INFINITY })).toBe(0)
  })

  it('sums a day of orders without inflating by the fees', () => {
    const orders = [order(), order({ total_cents: 1100, delivery_fee_cents: 300 })]
    const total = orders.reduce((sum, o) => sum + orderTotalCents(o), 0)
    expect(total).toBe(2750)
    expect(total).not.toBe(3450) // the sum of totals + fees
  })
})

describe('orderSubtotalCents', () => {
  it('strips the delivery fee out of the stored total', () => {
    const paidOrder = {
      subtotal_cents: 1250,
      delivery_fee_cents: 400,
      discount_cents: 0,
      total_cents: 1650,
    }
    expect(orderSubtotalCents(paidOrder)).toBe(1250)
  })

  it('is a no-op for self-pickup orders that carry no fee', () => {
    expect(orderSubtotalCents({ total_cents: 1250, delivery_fee_cents: 0 })).toBe(1250)
  })

  it('reconciles the receipt rows to the amount charged', () => {
    // The identity a receipt depends on: subtotal + fee === total. Pinned over
    // discounted, fee-free and legacy-shaped rows alike.
    const rows = [
      { delivery_fee_cents: 400, total_cents: 1650 },
      { delivery_fee_cents: 0, total_cents: 1250 },
      { delivery_fee_cents: 500, total_cents: 2200 }, // discounted
      { delivery_fee_cents: null, total_cents: 900 },
      { delivery_fee_cents: 350, total_cents: null },
    ]
    for (const row of rows) {
      expect(orderSubtotalCents(row) + (row.delivery_fee_cents ?? 0)).toBe(
        orderTotalCents(row),
      )
    }
  })

  it('reduces to the total when the fee column is null', () => {
    expect(orderSubtotalCents({ total_cents: 1650, delivery_fee_cents: null })).toBe(1650)
    expect(
      orderSubtotalCents({ total_cents: 1650, delivery_fee_cents: Number.NaN }),
    ).toBe(1650)
  })
})
