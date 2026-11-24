import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  createCoupon: vi.fn(),
  createSession: vi.fn(),
  expireSession: vi.fn(),
  insertOrder: vi.fn(),
  createBill: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }))
vi.mock('@/lib/validators/env', () => ({ env: { STRIPE_SECRET_KEY: 'test-key', NEXT_PUBLIC_URL: 'https://example.test' } }))
vi.mock('@/lib/stripe/config', () => ({ getStripeConfigIssue: () => null }))
vi.mock('stripe', () => ({
  default: class {
    coupons = { create: mocks.createCoupon }
    checkout = { sessions: { create: mocks.createSession, expire: mocks.expireSession } }
  },
}))
vi.mock('@/lib/billplz/client', () => ({
  getBillplzConfigIssue: () => null,
  normalizeBillplzMobile: (phone: string) => phone,
  createBill: mocks.createBill,
}))

import { POST } from '../route'

type Promo = {
  id: string
  scope: 'order' | 'delivery'
  discount_type: 'fixed' | 'percentage'
  discount_value: number
  max_discount_cents: number | null
  min_order_amount_cents: number | null
  max_uses: number | null
  current_uses: number
}

const promo = (scope: Promo['scope'], type: Promo['discount_type'], value: number, cap: number | null = null): Promo => ({
  id: `${scope}-promo`, scope, discount_type: type, discount_value: value,
  max_discount_cents: cap, min_order_amount_cents: null, max_uses: null, current_uses: 0,
})

function setup(promos: Promo[], price = 1001, writeResult: { data: unknown; error: unknown } | Error = { data: { id: 'order' }, error: null }) {
  const client = {
    from(table: string) {
      let scope = ''
      let action = ''
      const query = {
        select: () => query,
        in: () => query,
        limit: () => query,
        gte: () => query,
        lte: () => query,
        eq: (key: string, value: string) => { if (key === 'scope') scope = value; return query },
        insert: (value: unknown) => { action = 'insert'; if (table === 'orders') mocks.insertOrder(value); return query },
        update: () => { action = 'update'; return query },
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: ReturnType<typeof result>) => void) => resolve(result()),
      }
      function result() {
        if (table === 'orders' && action === 'update') {
          if (writeResult instanceof Error) throw writeResult
          return writeResult
        }
        let data: unknown = null
        if (table === 'menu_items') data = [{ id: 'item', name: 'Dish', price_cents: price, image_url: null, is_available: true }]
        if (table === 'menu_item_modifier_groups') data = []
        if (table === 'store_settings') data = { pickup_enabled: true }
        if (table === 'customers') data = { id: 'customer' }
        if (table === 'promo_codes') data = promos.find(p => p.scope === scope) ?? null
        if (table === 'orders' && action === 'insert') data = { id: 'order' }
        if (table === 'order_items') data = [{ id: 'order-item' }]
        return { data, error: null }
      }
      return query
    },
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }
  mocks.getAuthenticatedUser.mockResolvedValue({
    user: { id: 'user', email: 'user@example.test', email_confirmed_at: '2026-01-01', user_metadata: {} },
    supabase: client,
  })
}

function request(promos: Promo[], delivery = true, paymentMethod?: 'stripe' | 'billplz') {
  return new Request('http://localhost/api/checkout/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: 'item', name: 'Untrusted', quantity: 1 }],
      deliveryAddress: { fullName: 'Test', phone: '0123456789', address: 'Street', postalCode: '12345', city: 'City', state: 'State' },
      deliveryFee: 9999,
      deliveryType: delivery ? 'delivery' : 'self_pickup',
      ...(delivery ? { quotationId: 'quote', priceBreakdown: { base: '5.01', total: '5.01', currency: 'MYR' } } : {}),
      promoCodes: promos.map(p => ({ code: p.id, scope: p.scope })),
      ...(paymentMethod ? { paymentMethod } : {}),
    }),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createCoupon.mockResolvedValue({ id: 'coupon' })
  mocks.createSession.mockResolvedValue({ id: 'session', url: 'https://checkout.example.test' })
  mocks.expireSession.mockResolvedValue({ id: 'session', status: 'expired' })
  mocks.createBill.mockResolvedValue({ id: 'bill', url: 'https://billplz.example.test/bill' })
})

describe('Stripe checkout persistence', () => {
  it.each([
    ['database error', { data: null, error: { message: 'write failed' } }],
    ['no matching order', { data: null, error: null }],
    ['lost database response', new Error('connection lost')],
  ])('withholds the payment URL and expires the session on %s', async (_name, writeResult) => {
    setup([], 1001, writeResult)
    const response = await POST(request([]))
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.checkoutUrl).toBeUndefined()
    expect(mocks.expireSession).toHaveBeenCalledWith('session')
  })
  it('withholds the URL even if the Stripe session cannot be expired', async () => {
    setup([], 1001, { data: null, error: { message: 'write failed' } })
    mocks.expireSession.mockRejectedValueOnce(new Error('Stripe unavailable'))
    const response = await POST(request([]))
    expect(response.status).toBe(500)
    expect((await response.json()).checkoutUrl).toBeUndefined()
    expect(mocks.expireSession).toHaveBeenCalledWith('session')
  })
})

describe('Stripe checkout amounts', () => {
  it.each([
    ['delivery only', [promo('delivery', 'fixed', 301)], 301, 1201],
    ['free delivery capped at the fee', [promo('delivery', 'fixed', 1000)], 501, 1001],
    ['rounded delivery percentage', [promo('delivery', 'percentage', 25)], 125, 1377],
    ['order only', [promo('order', 'fixed', 300)], 300, 1202],
    ['combined rounded percentages with cap', [promo('order', 'percentage', 25), promo('delivery', 'percentage', 50, 200)], 450, 1052],
    ['no discount', [], 0, 1502],
  ])('matches the persisted total for %s', async (_name, promos, discount, expectedTotal) => {
    setup(promos)
    const response = await POST(request(promos))
    expect(response.status).toBe(200)
    expect(mocks.insertOrder).toHaveBeenCalledWith(expect.objectContaining({ subtotal_cents: 1001, delivery_fee_cents: 501, discount_cents: discount, total_cents: expectedTotal }))
    const session = mocks.createSession.mock.calls[0][0]
    const gross = session.line_items.reduce((sum: number, item: { price_data: { unit_amount: number }, quantity: number }) => sum + item.price_data.unit_amount * item.quantity, 0)
    const couponAmount = session.discounts ? mocks.createCoupon.mock.calls[0][0].amount_off : 0
    expect(gross - couponAmount).toBe(expectedTotal)
    if (discount > 0) expect(mocks.createCoupon.mock.calls[0][0]).toMatchObject({ amount_off: discount, currency: 'myr' })
    else expect(mocks.createCoupon).not.toHaveBeenCalled()
  })

  it.each([
    ['stripe', undefined, 'stripe'],
    ['billplz', 'billplz', 'billplz'],
  ] as const)('persists the gateway on a %s checkout', async (_name, method, expected) => {
    setup([])
    const response = await POST(request([], true, method))
    expect(response.status).toBe(200)
    expect(mocks.insertOrder).toHaveBeenCalledWith(expect.objectContaining({ payment_method: expected }))
  })

  it('rejects a zero total before creating an order or Stripe session', async () => {
    const promos = [promo('order', 'percentage', 100), promo('delivery', 'percentage', 100)]
    setup(promos)
    const response = await POST(request(promos))
    expect(response.status).toBe(400)
    expect(mocks.insertOrder).not.toHaveBeenCalled()
    expect(mocks.createCoupon).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})
