import { beforeEach, describe, expect, it, vi } from 'vitest'

const { verify, finalize, createClient } = vi.hoisted(() => ({
  verify: vi.fn(),
  finalize: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('@/lib/stripe/client', () => ({
  createStripeClient: () => ({ verifyWebhookSignature: verify }),
}))
vi.mock('@/lib/services/order-payment', () => ({ finalizePaidOrder: finalize }))
vi.mock('@supabase/ssr', () => ({ createServerClient: createClient }))

import { POST } from '../route'

const session = {
  id: 'cs_1',
  metadata: { order_id: 'order-1' },
  payment_intent: 'pi_1',
  payment_status: 'paid',
  amount_total: 1250,
  currency: 'myr',
}
const order = { id: 'order-1', status: 'pending', total_cents: 1250, stripe_session_id: 'cs_1' }

type OrderRow = Omit<typeof order, 'stripe_session_id'> & { stripe_session_id: string | null }

function database(row: OrderRow | null, concurrentRow?: OrderRow) {
  let current = row
  const update = vi.fn((patch: Partial<OrderRow>) => {
    if (concurrentRow) current = concurrentRow
    const conditions: Array<[keyof OrderRow, unknown]> = []
    const execute = async () => {
      const matches = current !== null && conditions.every(([key, value]) => current?.[key] === value)
      if (matches && current) current = { ...current, ...patch }
      return { data: matches ? [{ id: current?.id }] : [], error: null }
    }
    const query = {
      eq(key: keyof OrderRow, value: unknown) { conditions.push([key, value]); return query },
      select: execute,
      then(resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown) { return execute().then(resolve) },
    }
    return query
  })
  return {
    update,
    getRow: () => current,
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }),
      update,
    }),
  }
}

function event(type: string, overrides: Record<string, unknown> = {}) {
  verify.mockReturnValue({ id: 'evt_1', type, data: { object: { ...session, ...overrides } } })
}

function request() {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST', headers: { 'stripe-signature': 'signature' }, body: '{}',
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test-webhook-secret')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.test')
  createClient.mockReturnValue(database(order))
  finalize.mockResolvedValue({ outcome: 'advanced' })
  event('checkout.session.completed')
})

describe('Stripe webhook payment binding', () => {
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])(
    'finalizes a matched paid %s session', async type => {
      event(type)
      const response = await POST(request())
      expect(response.status).toBe(200)
      expect(finalize).toHaveBeenCalledWith(expect.anything(), 'order-1', {
        paymentPatch: { stripe_payment_intent_id: 'pi_1' }, logLabel: 'Webhook',
        stripePayment: { sessionId: 'cs_1', amountTotal: 1250, currency: 'myr' },
      })
    },
  )

  it.each([
    ['different session', { id: 'cs_other' }],
    ['underpayment', { amount_total: 100 }],
    ['missing amount', { amount_total: null }],
    ['wrong currency', { currency: 'usd' }],
    ['missing currency', { currency: null }],
  ])('does not finalize a paid session with %s', async (_description, overrides) => {
    event('checkout.session.completed', overrides)
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('retries an unpersisted session instead of accepting it', async () => {
    createClient.mockReturnValue(database({ ...order, stripe_session_id: null }))
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(finalize).not.toHaveBeenCalled()

    // A retry succeeds after the checkout writer persists the session.
    createClient.mockReturnValue(database(order))
    const retry = await POST(request())
    expect(retry.status).toBe(200)
    expect(finalize).toHaveBeenCalledTimes(1)
  })

  it('rejects an unmatched paid event even when the order is already preparing', async () => {
    createClient.mockReturnValue(database({ ...order, status: 'preparing' }))
    event('checkout.session.completed', { id: 'cs_other' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('rejects a wrong amount even when the order is already preparing', async () => {
    createClient.mockReturnValue(database({ ...order, status: 'preparing' }))
    event('checkout.session.completed', { amount_total: 100 })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('acknowledges a replay of a matched paid session', async () => {
    createClient.mockReturnValue(database({ ...order, status: 'preparing' }))
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('reports reconciliation when the order is cancelled during finalization', async () => {
    finalize.mockResolvedValue({ outcome: 'already_processed', status: 'cancelled' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
  })

  it('retries when payment binding changes during finalization', async () => {
    finalize.mockResolvedValue({ outcome: 'failed', error: 'Stripe payment no longer matches order' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
  })

  it('does not silently accept a payment for a cancelled order', async () => {
    createClient.mockReturnValue(database({ ...order, status: 'cancelled' }))
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('does not cancel an order for a different failed session', async () => {
    const db = database(order)
    createClient.mockReturnValue(db)
    event('checkout.session.async_payment_failed', { id: 'cs_other', payment_status: 'unpaid' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(db.update).not.toHaveBeenCalled()
  })

  it('cancels an order for its matched failed session', async () => {
    const db = database(order)
    createClient.mockReturnValue(db)
    event('checkout.session.async_payment_failed', { payment_status: 'unpaid' })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(db.update).toHaveBeenCalledWith({ status: 'cancelled' })
    expect(finalize).not.toHaveBeenCalled()
  })

  it.each([
    ['finalized', { ...order, status: 'preparing' }],
    ['replacement session', { ...order, stripe_session_id: 'cs_new' }],
    ['changed total', { ...order, total_cents: 2500 }],
  ])('does not cancel an order %s during async failure processing', async (_description, changedOrder) => {
    const db = database(order, changedOrder)
    createClient.mockReturnValue(db)
    event('checkout.session.async_payment_failed', { payment_status: 'unpaid' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(db.getRow()).toEqual(changedOrder)
  })

  it.each(['paid', 'accepted'])('does not cancel an already %s order on async failure', async status => {
    const db = database({ ...order, status })
    createClient.mockReturnValue(db)
    event('checkout.session.async_payment_failed', { payment_status: 'unpaid' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(500)
    expect(db.getRow()?.status).toBe(status)
  })

  it('defers a matched unpaid completed session', async () => {
    event('checkout.session.completed', { payment_status: 'unpaid' })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(finalize).not.toHaveBeenCalled()
  })

  it('rejects an async success without paid status', async () => {
    event('checkout.session.async_payment_succeeded', { payment_status: 'unpaid' })
    const response = await POST(request())
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(finalize).not.toHaveBeenCalled()
  })
})
