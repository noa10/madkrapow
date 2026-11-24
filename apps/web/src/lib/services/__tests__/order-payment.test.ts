import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFulfill, mockNotify, mockEnv } = vi.hoisted(() => ({
  mockFulfill: vi.fn(),
  mockNotify: vi.fn(),
  mockEnv: { HUBBOPOS_ENABLED: false },
}))

vi.mock('@/lib/services/order-fulfillment', () => ({
  fulfillDeliveryOrder: (...args: unknown[]) => mockFulfill(...args),
}))

vi.mock('@/lib/bots/notifications', () => ({
  notifyKitchenOfPaidOrder: (...args: unknown[]) => mockNotify(...args),
}))

vi.mock('@/lib/validators/env', () => ({
  env: mockEnv,
}))

import { finalizePaidOrder } from '../order-payment'

interface MockOrder {
  id: string
  status: string
  source?: string
  delivery_type?: string
  fulfillment_type?: string
  stripe_session_id?: string | null
  total_cents?: number
}

function buildClient(
  order: MockOrder | null,
  updatedRows: Array<{ id: string }> = [],
  latestOrder = order,
  paymentOptions: { existing?: { id: string } | null } = {},
) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = []
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = []
  let reads = 0

  const client = {
    updates,
    inserts,
    from(table: string) {
      if (table === 'payments') {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: unknown) => ({
              maybeSingle: async () => ({ data: paymentOptions.existing ?? null, error: null }),
            }),
          }),
          insert: async (payload: Record<string, unknown>) => {
            inserts.push({ table, payload })
            return { error: null }
          },
        }
      }
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: unknown) {
              return {
                single: async () => ({ data: reads++ === 0 ? order : latestOrder, error: null }),
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          updates.push({ table, patch })
          const chain = {
            eq(_column: string, _value: unknown) {
              return chain
            },
            select: async (_columns: string) => ({ data: updatedRows, error: null }),
            then(resolve: (value: { error: null }) => void) {
              resolve({ error: null })
            },
          }
          return chain
        },
      }
    },
  }

  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFulfill.mockResolvedValue({ success: true, dispatchStatus: 'assigning_driver' })
  mockNotify.mockResolvedValue(undefined)
})

describe('finalizePaidOrder', () => {
  it.each([
    ['session', { stripe_session_id: 'cs_new', total_cents: 1250 }],
    ['amount', { stripe_session_id: 'cs_old', total_cents: 1500 }],
  ])('does not finalize when the %s changes after the order is read', async (_field, currentPayment) => {
    const row = { id: 'order-1', status: 'pending', stripe_session_id: 'cs_old', total_cents: 1250 }
    let stored = { ...row }
    const client = {
      from() {
        return {
          select() {
            return { eq: () => ({ single: async () => ({ data: { ...row }, error: null }) }) }
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            const chain = {
              eq(column: string, value: unknown) { filters[column] = value; return chain },
              async select() {
                stored = { ...stored, ...currentPayment }
                const matches = Object.entries(filters).every(([key, value]) => stored[key as keyof typeof stored] === value)
                if (matches) stored = { ...stored, ...patch }
                return { data: matches ? [{ id: stored.id }] : [], error: null }
              },
            }
            return chain
          },
        }
      },
    }
    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_old', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })
    expect(result.outcome).toBe('failed')
    expect(stored.status).toBe('pending')
    expect(mockFulfill).not.toHaveBeenCalled()
  })

  it.each([
    ['matching winner', { status: 'preparing' }, { outcome: 'already_processed', status: 'preparing' }],
    ['matching later state', { status: 'delivered' }, { outcome: 'already_processed', status: 'delivered' }],
    ['cancelled', { status: 'cancelled' }, { outcome: 'failed' }],
    ['status-only change', { status: 'accepted' }, { outcome: 'failed' }],
    ['replaced session', { status: 'preparing', stripe_session_id: 'cs_new' }, { outcome: 'failed' }],
    ['changed amount', { status: 'preparing', total_cents: 1500 }, { outcome: 'failed' }],
  ])('handles a concurrent %s after a lost Stripe update', async (_name, change, expected) => {
    const order = { id: 'order-1', status: 'pending', stripe_session_id: 'cs_1', total_cents: 1250 }
    const client = buildClient(order, [], { ...order, ...change })
    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_1', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })
    expect(result).toMatchObject(expected)
    expect(mockFulfill).not.toHaveBeenCalled()
  })

  it('rejects a replaced Stripe session even when the order is already preparing', async () => {
    const client = buildClient({ id: 'order-1', status: 'preparing', stripe_session_id: 'cs_new', total_cents: 1250 })
    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_old', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })
    expect(result.outcome).toBe('failed')
  })

  it('does not finalize a Stripe payment in a different currency', async () => {
    const client = buildClient({ id: 'order-1', status: 'pending' }, [{ id: 'order-1' }])
    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_old', amountTotal: 1250, currency: 'usd' },
      logLabel: 'Test',
    })
    expect(result.outcome).toBe('failed')
    expect(client.updates).toHaveLength(0)
  })

  it('advances a Stripe order when the verified payment still matches', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', stripe_session_id: 'cs_1', total_cents: 1250 },
      [{ id: 'order-1' }],
    )
    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_1', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })
    expect(result.outcome).toBe('advanced')
    expect(mockFulfill).toHaveBeenCalledWith(client, 'order-1')
  })

  it('advances a pending order and dispatches an ASAP delivery', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', source: 'web', delivery_type: 'delivery', fulfillment_type: 'asap' },
      [{ id: 'order-1' }],
    )

    const result = await finalizePaidOrder(client as never, 'order-1', {
      paymentPatch: { billplz_bill_id: 'bill-1' },
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'advanced' })
    expect(client.updates[0]).toEqual({
      table: 'orders',
      patch: { status: 'preparing', billplz_bill_id: 'bill-1' },
    })
    expect(mockFulfill).toHaveBeenCalledWith(client, 'order-1')
  })

  it('is a no-op for an order already past the paid transition', async () => {
    const client = buildClient({
      id: 'order-1',
      status: 'preparing',
      delivery_type: 'delivery',
      fulfillment_type: 'asap',
    })

    const result = await finalizePaidOrder(client as never, 'order-1', {
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'already_processed', status: 'preparing' })
    expect(client.updates).toHaveLength(0)
    expect(mockFulfill).not.toHaveBeenCalled()
  })

  it('does not dispatch when another process won the atomic update', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', delivery_type: 'delivery', fulfillment_type: 'asap' },
      [],
    )

    const result = await finalizePaidOrder(client as never, 'order-1', {
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'already_processed', status: 'preparing' })
    expect(mockFulfill).not.toHaveBeenCalled()
  })

  it('marks self-pickup as not ready instead of calling Lalamove', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', delivery_type: 'self_pickup', fulfillment_type: 'asap' },
      [{ id: 'order-1' }],
    )

    const result = await finalizePaidOrder(client as never, 'order-1', {
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'advanced' })
    expect(client.updates[1]).toEqual({
      table: 'orders',
      patch: { dispatch_status: 'not_ready' },
    })
    expect(mockFulfill).not.toHaveBeenCalled()
  })

  it('queues a scheduled delivery instead of dispatching it immediately', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', delivery_type: 'delivery', fulfillment_type: 'scheduled' },
      [{ id: 'order-1' }],
    )

    const result = await finalizePaidOrder(client as never, 'order-1', {
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'advanced' })
    expect(client.updates[1]).toEqual({
      table: 'orders',
      patch: { dispatch_status: 'queued' },
    })
    expect(mockFulfill).not.toHaveBeenCalled()
  })

  it('notifies the kitchen for bot orders', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', source: 'telegram', delivery_type: 'self_pickup', fulfillment_type: 'asap' },
      [{ id: 'order-1' }],
    )

    await finalizePaidOrder(client as never, 'order-1', { logLabel: 'Test' })

    expect(mockNotify).toHaveBeenCalledWith('order-1')
  })

  it('returns not_found when the order is missing', async () => {
    const client = buildClient(null)

    const result = await finalizePaidOrder(client as never, 'missing', {
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'not_found' })
  })

  it('writes the payments ledger row when a Stripe payment advances the order', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', stripe_session_id: 'cs_1', total_cents: 1250 },
      [{ id: 'order-1' }],
    )

    await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_1', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })

    expect(client.inserts).toEqual([
      {
        table: 'payments',
        payload: expect.objectContaining({
          order_id: 'order-1',
          method: 'stripe',
          amount_cents: 1250,
          currency: 'MYR',
          status: 'succeeded',
          external_ref: 'cs_1',
        }),
      },
    ])
  })

  it('heals a missing ledger row when the Stripe order was already finalised', async () => {
    const client = buildClient({
      id: 'order-1',
      status: 'preparing',
      stripe_session_id: 'cs_1',
      total_cents: 1250,
    })

    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_1', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'already_processed', status: 'preparing' })
    expect(client.inserts).toHaveLength(1)
    expect(client.inserts[0].payload).toMatchObject({ external_ref: 'cs_1', status: 'succeeded' })
  })

  it('does not record a succeeded payment for a cancelled order', async () => {
    const client = buildClient({
      id: 'order-1',
      status: 'cancelled',
      stripe_session_id: 'cs_1',
      total_cents: 1250,
    })

    const result = await finalizePaidOrder(client as never, 'order-1', {
      stripePayment: { sessionId: 'cs_1', amountTotal: 1250, currency: 'myr' },
      logLabel: 'Test',
    })

    expect(result).toEqual({ outcome: 'already_processed', status: 'cancelled' })
    expect(client.inserts).toHaveLength(0)
  })

  it('does not write a Stripe ledger row for a Billplz finalisation', async () => {
    const client = buildClient(
      { id: 'order-1', status: 'pending', delivery_type: 'self_pickup', fulfillment_type: 'asap' },
      [{ id: 'order-1' }],
    )

    await finalizePaidOrder(client as never, 'order-1', {
      paymentPatch: { billplz_bill_id: 'bill-1' },
      logLabel: 'Test',
    })

    expect(client.inserts).toHaveLength(0)
  })
})
