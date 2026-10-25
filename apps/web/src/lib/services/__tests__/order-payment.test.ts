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
}

function buildClient(order: MockOrder | null, updatedRows: Array<{ id: string }> = []) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = []

  const client = {
    updates,
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: unknown) {
              return {
                single: async () => ({ data: order, error: null }),
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
})
