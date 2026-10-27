import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

function makeRequest(status: string): Request {
  return new Request(`http://localhost/api/admin/orders/${ORDER_ID}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

function context() {
  return { params: Promise.resolve({ id: ORDER_ID }) }
}

function clientFor(
  currentStatus: string,
  deliveryType = 'dine_in',
  source = 'web',
  conflict = false
) {
  const updates: Record<string, unknown>[] = []
  const client = {
    updates,
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data:
              table === 'orders'
                ? { status: currentStatus, delivery_type: deliveryType, source }
                : null,
            error: null,
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        return {
          eq: () => ({
            eq: () => ({
              select: async () => ({
                data: conflict ? [] : [{ id: 'order-row' }],
                error: null,
              }),
            }),
          }),
        }
      },
      insert: async () => ({ error: null }),
    }),
  }
  return client
}

function auth(
  role: string,
  currentStatus: string,
  deliveryType = 'dine_in',
  source = 'web',
  conflict = false
) {
  const client = clientFor(currentStatus, deliveryType, source, conflict)
  return {
    client,
    user: { id: 'staff-user', app_metadata: { role } },
    supabase: client,
  }
}

describe('POST /api/admin/orders/[id]/status role gates', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('lets a cashier advance a paid ticket to preparing', async () => {
    const session = auth('cashier', 'paid')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('preparing') as never, context() as never)
    expect(response.status).toBe(200)
    expect(session.client.updates).toEqual([
      expect.objectContaining({ status: 'preparing' }),
    ])
  })

  it('lets the kitchen mark a preparing ticket ready', async () => {
    const session = auth('kitchen', 'preparing')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(200)
  })

  it('stops a cashier from marking an order paid manually', async () => {
    const session = auth('cashier', 'pending')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('paid') as never, context() as never)
    expect(response.status).toBe(403)
    expect(session.client.updates).toEqual([])
  })

  it('stops the kitchen from cancelling an order', async () => {
    const session = auth('kitchen', 'paid')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('cancelled') as never, context() as never)
    expect(response.status).toBe(403)
    expect(session.client.updates).toEqual([])
  })

  it('lets a cashier void an abandoned pending table order', async () => {
    const session = auth('cashier', 'pending', 'dine_in')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('cancelled') as never, context() as never)
    expect(response.status).toBe(200)
    expect(session.client.updates).toEqual([
      expect.objectContaining({ status: 'cancelled' }),
    ])
  })

  it('does not let a cashier cancel a pending web delivery order', async () => {
    const session = auth('cashier', 'pending', 'delivery', 'web')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('cancelled') as never, context() as never)
    expect(response.status).toBe(403)
    expect(session.client.updates).toEqual([])
  })

  it('lets a cashier void an unpaid pay-later take-away order', async () => {
    const session = auth('cashier', 'pending', 'self_pickup', 'counter')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('cancelled') as never, context() as never)
    expect(response.status).toBe(200)
    expect(session.client.updates).toEqual([
      expect.objectContaining({ status: 'cancelled' }),
    ])
  })

  it('does not let the kitchen void a pending table order', async () => {
    const session = auth('kitchen', 'pending', 'dine_in')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('cancelled') as never, context() as never)
    expect(response.status).toBe(403)
  })

  it('lets an admin mark a web order paid manually', async () => {
    const session = auth('admin', 'pending', 'delivery', 'web')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('paid') as never, context() as never)
    expect(response.status).toBe(200)
  })

  it('does not let an admin mark a POS pay-later order paid outside settle', async () => {
    const session = auth('admin', 'pending', 'self_pickup', 'counter')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('paid') as never, context() as never)
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/settle flow/i)
    expect(session.client.updates).toEqual([])
  })

  it('returns 409 when the order changed concurrently', async () => {
    const session = auth('cashier', 'paid', 'dine_in', 'counter', true)
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('preparing') as never, context() as never)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/state changed/i)
  })

  it('still rejects non-canonical transitions', async () => {
    const session = auth('kitchen', 'ready')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('preparing') as never, context() as never)
    expect(response.status).toBe(400)
  })
})
