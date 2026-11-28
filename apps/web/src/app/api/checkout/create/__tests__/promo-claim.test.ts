import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Route-level contract for the promo-cap race fix.
 *
 * The route must build one applied-promo snapshot while it prices the cart,
 * persist that snapshot on the order, then claim it atomically with
 * claim_order_promos before any Stripe or Billplz request. Codes that were
 * skipped during pricing (inactive, exhausted, missing) must never reach the
 * claim payload or the charged total.
 */

type PromoScope = 'order' | 'delivery'

type Promo = {
  id: string
  code: string
  scope: PromoScope
  discount_type: 'fixed' | 'percentage'
  discount_value: number
  max_discount_cents: number | null
  min_order_amount_cents: number | null
  max_uses: number | null
  current_uses: number
  is_active: boolean
  valid_from: string
  valid_until: string
}

type ClaimEntry = {
  promo_id: string
  scope: PromoScope
  discount_cents: number
}

type ClaimArgs = {
  p_order_id: string
  p_promos: ClaimEntry[]
}

type QueryResult = { data: unknown; error: unknown }

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getServiceClient: vi.fn(),
  createCoupon: vi.fn(),
  createSession: vi.fn(),
  expireSession: vi.fn(),
  createBill: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mocks.getAuthenticatedUser(...args),
  getServiceClient: (...args: unknown[]) => mocks.getServiceClient(...args),
}))
vi.mock('@/lib/validators/env', () => ({
  env: { STRIPE_SECRET_KEY: 'test-key', NEXT_PUBLIC_URL: 'https://example.test' },
}))
vi.mock('@/lib/stripe/config', () => ({ getStripeConfigIssue: () => null }))
vi.mock('stripe', () => ({
  default: class {
    coupons = { create: (...args: unknown[]) => mocks.createCoupon(...args) }
    checkout = {
      sessions: {
        create: (...args: unknown[]) => mocks.createSession(...args),
        expire: (...args: unknown[]) => mocks.expireSession(...args),
      },
    }
  },
}))
vi.mock('@/lib/billplz/client', () => ({
  getBillplzConfigIssue: () => null,
  normalizeBillplzMobile: (phone: string) => phone,
  createBill: (...args: unknown[]) => mocks.createBill(...args),
}))

import { POST } from '../route'

let events: string[] = []
let orderInserts: Array<Record<string, unknown>> = []
let orderDeletes: string[] = []
let orderPromoApplicationInserts: unknown[] = []

function makePromo(overrides: Partial<Promo> & Pick<Promo, 'id' | 'code' | 'scope'>): Promo {
  return {
    discount_type: 'fixed',
    discount_value: 0,
    max_discount_cents: null,
    min_order_amount_cents: null,
    max_uses: null,
    current_uses: 0,
    is_active: true,
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: '2099-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/**
 * Emulates the promo_codes query filters the route sends: code, scope,
 * is_active and the valid_from/valid_until window. An exhausted promo is
 * still returned by the database; the route must skip it in code.
 */
function promoResult(
  filters: Record<string, unknown>,
  codes: string[],
  promos: Promo[],
): QueryResult {
  const matches = promos.filter((promo) => {
    const codeFilter = typeof filters.code === 'string' ? filters.code : null
    const codeMatches = codes.length > 0
      ? codes.some((code) => code.toLowerCase() === promo.code.toLowerCase())
      : codeFilter === null || codeFilter.toLowerCase() === promo.code.toLowerCase()
    if (!codeMatches) return false
    if (filters.scope !== undefined && promo.scope !== filters.scope) return false
    if (filters.is_active !== undefined && promo.is_active !== Boolean(filters.is_active)) return false
    const validUntilFloor = filters['gte:valid_until']
    if (typeof validUntilFloor === 'string' && Date.parse(promo.valid_until) < Date.parse(validUntilFloor)) return false
    const validFromCeiling = filters['lte:valid_from']
    if (typeof validFromCeiling === 'string' && Date.parse(promo.valid_from) > Date.parse(validFromCeiling)) return false
    return true
  })

  return { data: codes.length > 0 ? matches : matches[0] ?? null, error: null }
}

type SetupOptions = {
  promos?: Promo[]
  price?: number
  itemsError?: unknown
  claimError?: unknown
  claimThrows?: unknown
  claimApplications?: ClaimEntry[]
}

function setup(options: SetupOptions = {}) {
  const {
    promos = [],
    price = 1001,
    itemsError = null,
    claimError = null,
    claimThrows = null,
    claimApplications = null,
  } = options

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const codes: string[] = []
      let action: 'select' | 'insert' | 'update' | 'delete' = 'select'

      function result(): QueryResult {
        if (table === 'promo_codes') return promoResult(filters, codes, promos)
        if (table === 'menu_items') {
          return {
            data: [{ id: 'item', name: 'Dish', price_cents: price, image_url: null, is_available: true }],
            error: null,
          }
        }
        if (table === 'menu_item_modifier_groups' || table === 'modifier_groups') {
          return { data: [], error: null }
        }
        if (table === 'store_settings') return { data: { pickup_enabled: true }, error: null }
        if (table === 'customers') return { data: { id: 'customer' }, error: null }
        if (table === 'orders' && action === 'insert') return { data: { id: 'order' }, error: null }
        if (table === 'orders' && action === 'update') return { data: { id: 'order' }, error: null }
        if (table === 'orders' && action === 'delete') return { data: null, error: null }
        if (table === 'order_items' && action === 'insert') {
          return itemsError
            ? { data: null, error: itemsError }
            : { data: [{ id: 'order-item' }], error: null }
        }
        if (table === 'order_promo_applications' && action === 'insert') {
          return { data: null, error: null }
        }
        if (table === 'order_promo_applications' && action === 'select') {
          return { data: claimApplications, error: null }
        }
        return { data: null, error: null }
      }

      const query = {
        select: () => query,
        in: (column: string, values: unknown[]) => {
          filters[column] = values
          if (column === 'code') codes.push(...values.map(String))
          return query
        },
        limit: () => query,
        gte: (column: string, value: unknown) => {
          filters[`gte:${column}`] = value
          return query
        },
        lte: (column: string, value: unknown) => {
          filters[`lte:${column}`] = value
          return query
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value
          if (table === 'orders' && action === 'delete' && column === 'id') {
            orderDeletes.push(String(value))
          }
          return query
        },
        insert: (value: unknown) => {
          action = 'insert'
          events.push(`insert:${table}`)
          if (table === 'orders') orderInserts.push(value as Record<string, unknown>)
          if (table === 'order_promo_applications') orderPromoApplicationInserts.push(value)
          return query
        },
        update: () => {
          action = 'update'
          events.push(`update:${table}`)
          return query
        },
        delete: () => {
          action = 'delete'
          events.push(`delete:${table}`)
          return query
        },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: QueryResult) => unknown) => resolve(result()),
      }

      return query
    },
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  }

  mocks.getAuthenticatedUser.mockResolvedValue({
    user: {
      id: 'user',
      email: 'user@example.test',
      email_confirmed_at: '2026-01-01',
      user_metadata: {},
    },
    supabase: client,
  })
  mocks.getServiceClient.mockReturnValue(client)
  mocks.rpc.mockImplementation(async (fn: unknown) => {
    events.push(`rpc:${String(fn)}`)
    if (fn === 'claim_order_promos') {
      if (claimThrows) throw claimThrows
      return { data: null, error: claimError }
    }
    return { data: null, error: null }
  })
}

function request(
  promoCodes: Array<{ code: string; scope: PromoScope }>,
  options: { delivery?: boolean; paymentMethod?: 'stripe' | 'billplz' } = {},
): Parameters<typeof POST>[0] {
  const { delivery = true, paymentMethod } = options
  return new Request('http://localhost/api/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 'item', name: 'Untrusted', quantity: 1 }],
      deliveryAddress: {
        fullName: 'Test',
        phone: '0123456789',
        address: 'Street',
        postalCode: '12345',
        city: 'City',
        state: 'State',
      },
      deliveryFee: 9999,
      deliveryType: delivery ? 'delivery' : 'self_pickup',
      ...(delivery
        ? { quotationId: 'quote', priceBreakdown: { base: '5.01', total: '5.01', currency: 'MYR' } }
        : {}),
      promoCodes,
      ...(paymentMethod ? { paymentMethod } : {}),
    }),
  }) as unknown as Parameters<typeof POST>[0]
}

function claimCalls(): unknown[][] {
  return mocks.rpc.mock.calls.filter(([fn]) => fn === 'claim_order_promos')
}

function claimArgs(call: unknown[]): ClaimArgs {
  return call[1] as ClaimArgs
}

function gatewayEvents(): string[] {
  return events.filter((event) => event.startsWith('stripe:') || event.startsWith('billplz:'))
}

beforeEach(() => {
  vi.clearAllMocks()
  events = []
  orderInserts = []
  orderDeletes = []
  orderPromoApplicationInserts = []

  mocks.createCoupon.mockImplementation(async () => {
    events.push('stripe:coupon')
    return { id: 'coupon' }
  })
  mocks.createSession.mockImplementation(async () => {
    events.push('stripe:session')
    return { id: 'session', url: 'https://checkout.example.test' }
  })
  mocks.expireSession.mockImplementation(async () => {
    events.push('stripe:expire')
    return { id: 'session', status: 'expired' }
  })
  mocks.createBill.mockImplementation(async () => {
    events.push('billplz:bill')
    return { id: 'bill', url: 'https://billplz.example.test/bill' }
  })
})

describe('POST /api/checkout/create promo claim', () => {
  it('claims the exact order and delivery discounts that the gateway charges', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
        makePromo({
          id: 'delivery-promo',
          code: 'DELIVERY50',
          scope: 'delivery',
          discount_type: 'percentage',
          discount_value: 50,
          max_discount_cents: 200,
        }),
      ],
    })

    const response = await POST(request([
      { code: 'ORDER300', scope: 'order' },
      { code: 'DELIVERY50', scope: 'delivery' },
    ]))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, provider: 'stripe' })

    // 1001 subtotal + 501 delivery - (300 order + 200 capped delivery) = 1002.
    expect(orderInserts).toHaveLength(1)
    expect(orderInserts[0]).toMatchObject({
      subtotal_cents: 1001,
      delivery_fee_cents: 501,
      discount_cents: 500,
      total_cents: 1002,
    })

    const claims = claimCalls()
    expect(claims).toHaveLength(1)
    const args = claimArgs(claims[0])
    expect(args.p_order_id).toBe('order')
    expect([...args.p_promos].sort((a, b) => a.scope.localeCompare(b.scope))).toEqual([
      { promo_id: 'delivery-promo', scope: 'delivery', discount_cents: 200 },
      { promo_id: 'order-promo', scope: 'order', discount_cents: 300 },
    ])

    // The claim owns the promo application rows and usage counters, so the
    // route must not write them directly as well.
    expect(orderPromoApplicationInserts).toHaveLength(0)
    expect(mocks.rpc.mock.calls.map(([fn]) => fn)).not.toContain('increment_promo_code_usage')

    // Claim only after the order and its items exist, and before any Stripe call.
    const claimIndex = events.indexOf('rpc:claim_order_promos')
    expect(claimIndex).toBeGreaterThan(events.indexOf('insert:orders'))
    expect(claimIndex).toBeGreaterThan(events.indexOf('insert:order_items'))
    const firstGatewayIndex = events.findIndex((event) => event.startsWith('stripe:'))
    expect(firstGatewayIndex).toBeGreaterThan(claimIndex)

    // Stripe charges exactly the persisted total.
    const coupon = mocks.createCoupon.mock.calls[0][0] as { amount_off: number; currency: string }
    expect(coupon).toMatchObject({ amount_off: 500, currency: 'myr' })
    const session = mocks.createSession.mock.calls[0][0] as {
      line_items: Array<{ price_data: { unit_amount: number }; quantity: number }>
    }
    const gross = session.line_items.reduce(
      (sum, item) => sum + item.price_data.unit_amount * item.quantity,
      0,
    )
    expect(gross - coupon.amount_off).toBe(1002)
  })

  it('rounds percentages exactly as the database claim does', async () => {
    // 35% of 650 is 227.5. Multiplying before dividing rounds to 228, which is
    // what the SQL numeric calculation returns; dividing first produces
    // 227.499... and would make the claim reject a legitimate order.
    setup({
      price: 650,
      promos: [
        makePromo({
          id: 'order-promo',
          code: 'ORDER35',
          scope: 'order',
          discount_type: 'percentage',
          discount_value: 35,
        }),
      ],
    })

    const response = await POST(request([{ code: 'ORDER35', scope: 'order' }]))

    expect(response.status).toBe(200)
    expect(orderInserts[0]).toMatchObject({
      subtotal_cents: 650,
      delivery_fee_cents: 501,
      discount_cents: 228,
      total_cents: 923,
    })
    expect(claimArgs(claimCalls()[0]).p_promos).toEqual([
      { promo_id: 'order-promo', scope: 'order', discount_cents: 228 },
    ])
  })

  it('returns 409, removes the pending order, and creates no payment when the claim reports PROMO_UNAVAILABLE', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
        makePromo({ id: 'delivery-promo', code: 'DELIVERY200', scope: 'delivery', discount_value: 200 }),
      ],
      claimError: {
        code: 'P0001',
        message: 'PROMO_UNAVAILABLE',
        details: null,
        hint: null,
      },
    })

    const response = await POST(request([
      { code: 'ORDER300', scope: 'order' },
      { code: 'DELIVERY200', scope: 'delivery' },
    ]))
    const body = await response.json() as { success: boolean; code?: string; checkoutUrl?: string }

    expect(response.status).toBe(409)
    expect(body).toMatchObject({ success: false, code: 'PROMO_UNAVAILABLE' })
    expect(body.checkoutUrl).toBeUndefined()

    // The rejected order must not survive as an unpayable pending order.
    expect(orderDeletes).toEqual(['order'])
    expect(gatewayEvents()).toEqual([])
    expect(mocks.createCoupon).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.createBill).not.toHaveBeenCalled()
  })

  it('returns 500 and creates no payment when the claim fails for another reason', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
      ],
      claimError: {
        code: 'XX000',
        message: 'claim_order_promos failed',
        details: null,
        hint: null,
      },
    })

    const response = await POST(request([{ code: 'ORDER300', scope: 'order' }]))
    const body = await response.json() as { success: boolean; checkoutUrl?: string }

    expect(response.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.checkoutUrl).toBeUndefined()
    expect(orderDeletes).toEqual(['order'])
    expect(gatewayEvents()).toEqual([])
    expect(mocks.createCoupon).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.createBill).not.toHaveBeenCalled()
  })

  it('deletes the pending order when the claim request throws', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
      ],
      claimThrows: new Error('network down'),
    })

    const response = await POST(request([{ code: 'ORDER300', scope: 'order' }]))

    expect(response.status).toBe(500)
    expect(orderDeletes).toEqual(['order'])
    expect(gatewayEvents()).toEqual([])
  })

  it('continues when the claim committed but its response was lost', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
      ],
      claimError: {
        code: 'XX000',
        message: 'network connection lost after commit',
        details: null,
        hint: null,
      },
      claimApplications: [
        { promo_id: 'order-promo', scope: 'order', discount_cents: 300 },
      ],
    })

    const response = await POST(request([{ code: 'ORDER300', scope: 'order' }]))

    expect(response.status).toBe(200)
    expect(orderDeletes).toEqual([])
    expect(mocks.createCoupon).toHaveBeenCalledTimes(1)
    expect(mocks.createSession).toHaveBeenCalledTimes(1)
  })

  it('never claims promos when the order items cannot be persisted', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
      ],
      itemsError: {
        code: '23503',
        message: 'insert or update on table "order_items" violates foreign key constraint',
      },
    })

    const response = await POST(request([{ code: 'ORDER300', scope: 'order' }]))

    expect(response.status).toBe(500)
    expect(claimCalls()).toHaveLength(0)
    expect(orderDeletes).toEqual(['order'])
    expect(gatewayEvents()).toEqual([])
  })

  it('omits an exhausted promo from the total and the claim while still claiming a valid stacked promo', async () => {
    setup({
      promos: [
        makePromo({
          id: 'order-exhausted',
          code: 'EXHAUSTED300',
          scope: 'order',
          discount_value: 300,
          max_uses: 1,
          current_uses: 1,
        }),
        makePromo({ id: 'delivery-valid', code: 'DELIVERY301', scope: 'delivery', discount_value: 301 }),
      ],
    })

    const response = await POST(request([
      { code: 'EXHAUSTED300', scope: 'order' },
      { code: 'DELIVERY301', scope: 'delivery' },
    ]))

    expect(response.status).toBe(200)

    // Only the valid delivery discount reaches the order total.
    expect(orderInserts).toHaveLength(1)
    expect(orderInserts[0]).toMatchObject({ discount_cents: 301, total_cents: 1201 })

    // The exhausted code must not be claimed, even though the request sent it.
    expect(claimCalls()).toHaveLength(1)
    expect(claimArgs(claimCalls()[0]).p_promos).toEqual([
      { promo_id: 'delivery-valid', scope: 'delivery', discount_cents: 301 },
    ])
    expect(mocks.createCoupon.mock.calls[0][0]).toMatchObject({ amount_off: 301 })
  })

  it('does not discount or claim a code that the active-promo query excludes', async () => {
    setup({
      promos: [
        makePromo({
          id: 'order-inactive',
          code: 'INACTIVE300',
          scope: 'order',
          discount_value: 300,
          is_active: false,
        }),
        makePromo({ id: 'delivery-valid', code: 'DELIVERY301', scope: 'delivery', discount_value: 301 }),
      ],
    })

    const response = await POST(request([
      { code: 'INACTIVE300', scope: 'order' },
      { code: 'DELIVERY301', scope: 'delivery' },
    ]))

    expect(response.status).toBe(200)
    expect(orderInserts[0]).toMatchObject({ discount_cents: 301, total_cents: 1201 })
    expect(claimArgs(claimCalls()[0]).p_promos).toEqual([
      { promo_id: 'delivery-valid', scope: 'delivery', discount_cents: 301 },
    ])
  })

  it('claims before the Billplz bill exists and bills the discounted total', async () => {
    setup({
      promos: [
        makePromo({ id: 'order-promo', code: 'ORDER300', scope: 'order', discount_value: 300 }),
        makePromo({ id: 'delivery-promo', code: 'DELIVERY200', scope: 'delivery', discount_value: 200 }),
      ],
    })

    const response = await POST(request(
      [
        { code: 'ORDER300', scope: 'order' },
        { code: 'DELIVERY200', scope: 'delivery' },
      ],
      { paymentMethod: 'billplz' },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, provider: 'billplz' })

    const bill = mocks.createBill.mock.calls[0][0] as { amountCents: number }
    expect(bill.amountCents).toBe(1002)

    const claimIndex = events.indexOf('rpc:claim_order_promos')
    expect(claimIndex).toBeGreaterThan(events.indexOf('insert:order_items'))
    expect(claimIndex).toBeLessThan(events.indexOf('billplz:bill'))
    expect(mocks.createCoupon).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})
