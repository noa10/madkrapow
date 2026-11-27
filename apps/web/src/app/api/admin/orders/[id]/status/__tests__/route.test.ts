import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
const sendOrderStatusNotificationMock = vi.fn()
const markGrabOrderReadyMock = vi.fn()
const serviceClient = {}
vi.mock('@/lib/grabfood/order-actions', () => ({
  markGrabOrderReady: (...args: unknown[]) => markGrabOrderReadyMock(...args),
}))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => serviceClient,
}))
vi.mock('@/lib/bots/order-notifications', () => ({
  sendOrderStatusNotification: (...args: unknown[]) => sendOrderStatusNotificationMock(...args),
}))
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
  const events: Record<string, unknown>[] = []
  const client = {
    updates,
    events,
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
      insert: async (event: Record<string, unknown>) => {
        if (table === 'order_events') events.push(event)
        return { error: null }
      },
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
    sendOrderStatusNotificationMock.mockReset()
    markGrabOrderReadyMock.mockReset()
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

  it('completes a preparing POS take-away order when marked ready', async () => {
    const session = auth('kitchen', 'preparing', 'self_pickup', 'counter')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, status: 'delivered' })
    expect(session.client.updates).toEqual([
      expect.objectContaining({ status: 'delivered' }),
    ])
    expect(session.client.events).toEqual([
      expect.objectContaining({
        old_value: { status: 'preparing' },
        new_value: { status: 'delivered' },
      }),
    ])
    expect(sendOrderStatusNotificationMock).toHaveBeenCalledWith(ORDER_ID, 'delivered')
  })

  it('does not complete an unpaid POS takeaway', async () => {
    const session = auth('kitchen', 'pending', 'self_pickup', 'counter')
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(400)
    expect(session.client.updates).toEqual([])
    expect(session.client.events).toEqual([])
    expect(sendOrderStatusNotificationMock).not.toHaveBeenCalled()
  })

  it('does not complete a POS takeaway if its status changed concurrently', async () => {
    const session = auth('kitchen', 'preparing', 'self_pickup', 'counter', true)
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(409)
    expect(session.client.events).toEqual([])
    expect(sendOrderStatusNotificationMock).not.toHaveBeenCalled()
  })

  it('uses the Grab ready service for Grab pickup orders', async () => {
    const session = auth('kitchen', 'preparing', 'self_pickup', 'grabfood')
    requireRoleMock.mockResolvedValue(session)
    markGrabOrderReadyMock.mockResolvedValue({ ok: true })

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, status: 'ready' })
    expect(markGrabOrderReadyMock).toHaveBeenCalledWith(serviceClient, ORDER_ID)
    expect(session.client.updates).toEqual([])
  })

  it('does not complete a Grab pickup when notifying Grab fails', async () => {
    const session = auth('kitchen', 'preparing', 'self_pickup', 'grabfood')
    requireRoleMock.mockResolvedValue(session)
    markGrabOrderReadyMock.mockResolvedValue({ ok: false, error: 'Grab unavailable', status: 503 })

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'Grab unavailable' })
    expect(markGrabOrderReadyMock).toHaveBeenCalledWith(serviceClient, ORDER_ID)
    expect(session.client.updates).toEqual([])
  })

  it.each([
    ['dine-in', 'dine_in', 'counter'],
    ['web pickup', 'self_pickup', 'web'],
    ['delivery', 'delivery', 'counter'],
  ])('keeps %s orders ready when marked ready', async (_label, deliveryType, source) => {
    const session = auth('kitchen', 'preparing', deliveryType, source)
    requireRoleMock.mockResolvedValue(session)

    const response = await POST(makeRequest('ready') as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, status: 'ready' })
    expect(session.client.updates).toEqual([
      expect.objectContaining({ status: 'ready' }),
    ])
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

  it('does not leak database error text to the client', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: null,
              error: { message: 'relation "orders" secret internal detail' },
            }),
          }),
        }),
      }),
    }
    requireRoleMock.mockResolvedValue({
      user: { id: 'staff-user', app_metadata: { role: 'admin' } },
      supabase: client,
    })

    const response = await POST(makeRequest('preparing') as never, context() as never)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Failed to load order')
    expect(JSON.stringify(body)).not.toContain('secret internal detail')
  })
})
