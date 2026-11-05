import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAutoAppliedPromos } from '../auto'

interface PromoRow {
  code: string
  description: string | null
  scope: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  max_discount_cents: number | null
  min_order_amount_cents: number | null
  max_uses: number | null
  current_uses: number
  valid_from: string
  valid_until: string
  promo_items: Array<{ menu_item_id: string; role: string }>
}

const base = (overrides: Partial<PromoRow> = {}): PromoRow => ({
  code: 'AUTO10',
  description: '10% off',
  scope: 'order',
  discount_type: 'percentage',
  discount_value: 10,
  max_discount_cents: null,
  min_order_amount_cents: null,
  max_uses: null,
  current_uses: 0,
  valid_from: '2026-01-01T00:00:00Z',
  valid_until: '2027-01-01T00:00:00Z',
  promo_items: [],
  ...overrides,
})

function client(rows: PromoRow[] | null, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  builder.select = () => builder
  builder.eq = () => builder
  builder.gte = () => builder
  builder.lte = () => Promise.resolve({ data: rows, error })
  return { from: () => builder } as unknown as SupabaseClient
}

describe('getAutoAppliedPromos', () => {
  it('maps a percentage promo and carries its target items', async () => {
    const promos = await getAutoAppliedPromos(
      client([
        base({
          promo_items: [
            { menu_item_id: 'item-1', role: 'target' },
            { menu_item_id: 'item-2', role: 'bonus' },
          ],
        }),
      ]),
      2500,
      500,
    )

    expect(promos).toHaveLength(1)
    expect(promos[0]).toMatchObject({
      code: 'AUTO10',
      discountType: 'percentage',
      discountValue: 10,
      discountCents: 250,
      targetItemIds: ['item-1'],
    })
  })

  it('clamps the discount to the configured cap and the base amount', async () => {
    const capped = await getAutoAppliedPromos(
      client([base({ max_discount_cents: 200 })]),
      2500,
      0,
    )
    expect(capped[0].discountCents).toBe(200)

    const clamped = await getAutoAppliedPromos(
      client([base({ discount_type: 'fixed', discount_value: 9999 })]),
      1000,
      0,
    )
    expect(clamped[0].discountCents).toBe(1000)
  })

  it('skips promos that have reached their usage limit', async () => {
    const promos = await getAutoAppliedPromos(
      client([base({ max_uses: 10, current_uses: 10 })]),
      2500,
      0,
    )
    expect(promos).toEqual([])
  })

  it('honours the minimum against the delivery fee for delivery-scoped promos', async () => {
    const orderScoped = await getAutoAppliedPromos(
      client([base({ scope: 'order', min_order_amount_cents: 3000 })]),
      2500,
      500,
    )
    expect(orderScoped).toEqual([])

    const deliveryScoped = await getAutoAppliedPromos(
      client([base({ scope: 'delivery', min_order_amount_cents: 400 })]),
      2500,
      500,
    )
    expect(deliveryScoped).toHaveLength(1)
    expect(deliveryScoped[0].discountCents).toBe(50)
  })

  it('returns an empty list when the promo query fails', async () => {
    const promos = await getAutoAppliedPromos(
      client(null, { message: 'db down' }),
      2500,
      0,
    )
    expect(promos).toEqual([])
  })
})
