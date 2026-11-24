import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSession: vi.fn(),
  expireSession: vi.fn(),
  retrieveSession: vi.fn(),
}))

vi.mock('@/lib/validators/env', () => ({
  env: { STRIPE_SECRET_KEY: 'test-only-key', NEXT_PUBLIC_URL: 'https://example.test' },
}))
vi.mock('@/lib/stripe/config', () => ({ getStripeConfigIssue: () => null }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/bots/order-notifications', () => ({ sendOrderStatusNotification: vi.fn() }))
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: mocks.createSession, expire: mocks.expireSession, retrieve: mocks.retrieveSession } }
  },
}))

import { POST } from '../route'
import * as route from '../route'

function request(action: { action: 'approve'; approved_total_cents: number } | { action: 'reject' }) {
  return new Request('https://example.test/api/admin/orders/order-1/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  }) as never
}

const approve = (amount: number) => request({ action: 'approve', approved_total_cents: amount })
const params = { params: Promise.resolve({ id: 'order-1' }) }

function database(afterRead?: () => void) {
  let row: Record<string, unknown> = {
    id: 'order-1', customer_id: 'customer-1', order_kind: 'bulk',
    approval_status: 'pending_review', status: 'pending', stripe_session_id: null,
    total_cents: 0, bulk_company_name: 'Example Co', bulk_requested_date: '2099-01-10T12:30:00Z',
  }
  const events: Record<string, unknown>[] = []
  let updateFailure: 'before' | 'after' | null = null
  let afterUpdate: (() => void) | undefined
  const db = {
    from(table: string) {
      let patch: Record<string, unknown> | undefined
      let inserted: Record<string, unknown> | undefined
      let filters: Array<[string, unknown]> = []
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters = [...filters, [key, value]]; return query },
        is: (key: string, value: unknown) => { filters = [...filters, [key, value]]; return query },
        update: (value: Record<string, unknown>) => { patch = value; return query },
        insert: (value: Record<string, unknown>) => { inserted = value; return query },
        single: async () => {
          const snapshot = { ...row }
          afterRead?.()
          return { data: snapshot, error: null }
        },
        then: (resolve: (result: { data: Record<string, unknown>[] | null; error: { message: string } | null }) => void) => {
          if (table === 'order_events' && inserted) events.push(inserted)
          if (table === 'orders' && patch && filters.every(([key, value]) => row[key] === value)) {
            const failure = updateFailure
            updateFailure = null
            if (failure !== 'before') row = { ...row, ...patch }
            afterUpdate?.()
            if (failure) {
              resolve({ data: null, error: { message: 'connection lost' } })
              return
            }
            resolve({ data: [{ id: row.id }], error: null })
          } else {
            resolve({ data: [], error: null })
          }
        },
      }
      return query
    },
  }
  return {
    db, events,
    get row() { return row },
    setRow(patch: Record<string, unknown>) { row = { ...row, ...patch } },
    failUpdate(when: 'before' | 'after', callback?: () => void) { updateFailure = when; afterUpdate = callback },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createSession.mockResolvedValue({ id: 'session-1', url: 'https://example.test/session' })
  mocks.retrieveSession.mockResolvedValue({
    id: 'session-1', url: 'https://example.test/session', mode: 'payment', status: 'open',
    payment_status: 'unpaid', currency: 'myr', amount_total: 1250, metadata: { order_id: 'order-1' },
  })
})

describe('bulk approval payment integrity', () => {
  it('stores the same amount that is sent to Stripe', async () => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(approve(1250), params)
    expect(response.status).toBe(200)
    expect(state.row).toMatchObject({ approved_total_cents: 1250, total_cents: 1250, stripe_session_id: 'session-1' })
    expect(mocks.createSession.mock.calls[0][0]).toMatchObject({
      line_items: [{ price_data: { currency: 'myr', unit_amount: 1250 }, quantity: 1 }],
    })
  })

  it.each([0, -1, 12.5])('rejects %s cents without creating a session', async amount => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(approve(amount), params)
    expect(response.status).toBe(400)
    expect(state.row).toMatchObject({ approval_status: 'pending_review', stripe_session_id: null })
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('pairs the winning session and amount when approvals overlap', async () => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const waiting: Array<(value: { id: string; url: string }) => void> = []
    mocks.createSession.mockImplementation(() => new Promise(resolve => waiting.push(resolve)))
    const first = POST(approve(1250), params)
    const second = POST(approve(2300), params)
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    waiting[1]({ id: 'session-2300', url: 'https://example.test/2300' })
    const secondResponse = await second
    waiting[0]({ id: 'session-1250', url: 'https://example.test/1250' })
    const firstResponse = await first
    expect(secondResponse.status).toBe(200)
    expect(firstResponse.status).not.toBe(200)
    expect(state.row).toMatchObject({ approval_status: 'approved', total_cents: 2300, approved_total_cents: 2300, stripe_session_id: 'session-2300' })
    expect(state.events).toHaveLength(1)
    expect(mocks.expireSession).toHaveBeenCalledWith('session-1250')
    expect(mocks.expireSession).not.toHaveBeenCalledWith('session-2300')
  })

  it('recovers the checkout URL after a committed write has an ambiguous error', async () => {
    const state = database()
    state.failUpdate('after')
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(approve(1250), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, checkoutUrl: 'https://example.test/session' })
    expect(state.row).toMatchObject({ approval_status: 'approved', total_cents: 1250, stripe_session_id: 'session-1' })
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('does not expire a session after an ambiguous write error', async () => {
    const state = database()
    state.failUpdate('before')
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(approve(1250), params)
    expect(response.status).toBe(500)
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('does not expose or expire a session already finalized during an ambiguous write', async () => {
    const state = database()
    state.failUpdate('after', () => state.setRow({ status: 'preparing' }))
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(approve(1250), params)
    expect(response.status).not.toBe(200)
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('does not expire a session already linked when the conditional write loses', async () => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    mocks.createSession.mockImplementation(async () => {
      state.setRow({ status: 'preparing', stripe_session_id: 'session-1' })
      return { id: 'session-1', url: 'https://example.test/session' }
    })
    const response = await POST(approve(1250), params)
    expect(response.status).not.toBe(200)
    expect(mocks.expireSession).not.toHaveBeenCalled()
  })

  it('does not change an order finalized while Stripe creates the session', async () => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    mocks.createSession.mockImplementation(async () => {
      state.setRow({ status: 'preparing', total_cents: 5000, stripe_session_id: 'paid-session' })
      return { id: 'new-session', url: 'https://example.test/new' }
    })
    const response = await POST(approve(1250), params)
    expect(response.status).not.toBe(200)
    expect(state.row).toMatchObject({ status: 'preparing', total_cents: 5000, stripe_session_id: 'paid-session', approval_status: 'pending_review' })
    expect(state.events).toHaveLength(0)
  })

  it('does not replace an existing session that might already be paid', async () => {
    const state = database()
    state.setRow({ stripe_session_id: 'old-session', total_cents: 5000 })
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(approve(1250), params)
    expect(response.status).not.toBe(200)
    expect(state.row).toMatchObject({ stripe_session_id: 'old-session', total_cents: 5000, approval_status: 'pending_review' })
  })

  it('rejects a pending order without a payment session', async () => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(request({ action: 'reject' }), params)
    expect(response.status).toBe(200)
    expect(state.row).toMatchObject({ status: 'cancelled', approval_status: 'rejected' })
    expect(state.events).toHaveLength(1)
  })

  it('does not reject an order paid after the review read', async () => {
    const state = database(() => state.setRow({ status: 'preparing', stripe_session_id: 'paid-session' }))
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    const response = await POST(request({ action: 'reject' }), params)
    expect(response.status).not.toBe(200)
    expect(state.row).toMatchObject({ status: 'preparing', stripe_session_id: 'paid-session', approval_status: 'pending_review' })
    expect(state.events).toHaveLength(0)
  })

  it('allows retry after Stripe session creation fails', async () => {
    const state = database()
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    mocks.createSession.mockRejectedValueOnce(new Error('Stripe unavailable'))
    expect((await POST(approve(1250), params)).status).toBe(500)
    expect(state.row).toMatchObject({ approval_status: 'pending_review', stripe_session_id: null })
    expect((await POST(approve(1250), params)).status).toBe(200)
  })
})

describe('bulk checkout link recovery', () => {
  async function recover() {
    const get = (route as { GET?: typeof POST }).GET
    expect(get).toBeTypeOf('function')
    if (!get) throw new Error('GET recovery handler is unavailable')
    return get(request({ action: 'reject' }), params)
  }

  function approvedOrder() {
    const state = database()
    state.setRow({ approval_status: 'approved', stripe_session_id: 'session-1', total_cents: 1250, approved_total_cents: 1250 })
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1' }, supabase: state.db })
    return state
  }

  it('returns the verified existing checkout URL to an admin', async () => {
    approvedOrder()
    const response = await recover()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, checkoutUrl: 'https://example.test/session' })
    expect(mocks.retrieveSession).toHaveBeenCalledWith('session-1')
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('requires admin authorization', async () => {
    mocks.requireAdmin.mockResolvedValue({ error: new Response(null, { status: 403 }) })
    const response = await recover()
    expect(response.status).toBe(403)
    expect(mocks.retrieveSession).not.toHaveBeenCalled()
  })

  it.each([
    ['not approved', { approval_status: 'pending_review' }],
    ['already preparing', { status: 'preparing' }],
    ['missing session', { stripe_session_id: null }],
    ['inconsistent stored amounts', { approved_total_cents: 1200 }],
    ['non-bulk order', { order_kind: 'standard' }],
  ])('does not retrieve a session for an order that is %s', async (_name, changed) => {
    const state = approvedOrder()
    state.setRow(changed)
    const response = await recover()
    expect(response.status).not.toBe(200)
    expect(mocks.retrieveSession).not.toHaveBeenCalled()
  })

  it.each([
    ['paid', { payment_status: 'paid' }],
    ['expired', { status: 'expired' }],
    ['wrong mode', { mode: 'setup' }],
    ['wrong currency', { currency: 'usd' }],
    ['wrong amount', { amount_total: 1200 }],
    ['wrong order', { metadata: { order_id: 'other' } }],
    ['wrong session', { id: 'other' }],
    ['missing URL', { url: null }],
  ])('does not expose a %s session', async (_name, changed) => {
    approvedOrder()
    mocks.retrieveSession.mockResolvedValue({
      id: 'session-1', url: 'https://example.test/session', mode: 'payment', status: 'open',
      payment_status: 'unpaid', currency: 'myr', amount_total: 1250, metadata: { order_id: 'order-1' }, ...changed,
    })
    const response = await recover()
    expect(response.status).not.toBe(200)
    expect(await response.json()).not.toHaveProperty('checkoutUrl')
  })

  it('does not return the URL if the order is finalized during retrieval', async () => {
    const state = approvedOrder()
    mocks.retrieveSession.mockImplementation(async () => {
      state.setRow({ status: 'preparing' })
      return { id: 'session-1', url: 'https://example.test/session', mode: 'payment', status: 'open', payment_status: 'unpaid', currency: 'myr', amount_total: 1250, metadata: { order_id: 'order-1' } }
    })
    const response = await recover()
    expect(response.status).not.toBe(200)
    expect(await response.json()).not.toHaveProperty('checkoutUrl')
  })
})
