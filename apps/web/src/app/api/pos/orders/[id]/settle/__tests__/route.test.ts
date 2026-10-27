import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/pos/orders/${ORDER_ID}/settle`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

function context(id = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

function authWithRpc(result: unknown, error: unknown = null) {
  return {
    user: { id: 'staff-user-id' },
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: result, error }),
    },
  }
}

describe('POST /api/pos/orders/[id]/settle', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('collects cash payment through the atomic RPC', async () => {
    const auth = authWithRpc({ ok: true, status: 'paid', amount_cents: 2900 })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      status: 'paid',
      amount_cents: 2900,
    })
    expect(auth.supabase.rpc).toHaveBeenCalledWith('settle_dine_in_order', {
      p_order_id: ORDER_ID,
      p_method: 'cash',
      p_actor_id: 'staff-user-id',
    })
  })

  it('rejects an invalid payment method', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: true }))
    const response = await POST(
      makeRequest({ payment_method: 'credit_card' }) as never,
      context() as never
    )
    expect(response.status).toBe(400)
  })

  it('rejects a non-uuid order id without calling the RPC', async () => {
    const auth = authWithRpc({ ok: true })
    requireRoleMock.mockResolvedValue(auth)
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context('not-a-uuid') as never
    )
    expect(response.status).toBe(400)
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns 409 when the order was already paid', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'already_paid' })
    )
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )
    expect(response.status).toBe(409)
  })

  it('returns 404 for a missing order', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'not_found' }))
    const response = await POST(
      makeRequest({ payment_method: 'qr_pay' }) as never,
      context() as never
    )
    expect(response.status).toBe(404)
  })

  it('returns 400 for a non-dine-in order', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'not_dine_in' })
    )
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )
    expect(response.status).toBe(400)
  })

  it('returns 400 for a non-settleable order', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'not_settleable' })
    )
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/POS counter or dine-in/i)
  })

  it('returns 500 when the RPC errors', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc(null, { message: 'connection lost' })
    )
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )
    expect(response.status).toBe(500)
  })

  it('propagates the role guard denial', async () => {
    const { NextResponse } = await import('next/server')
    requireRoleMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )
    expect(response.status).toBe(403)
  })
})
