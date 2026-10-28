import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const TABLE_ID = '44444444-4444-4444-8444-444444444444'
const ORDER_IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
]

function makeRequest(
  body: unknown = { payment_method: 'cash', order_ids: ORDER_IDS }
): Request {
  return new Request(`http://localhost/api/pos/tables/${TABLE_ID}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Request
}

function context(id = TABLE_ID) {
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

describe('POST /api/pos/tables/[id]/settle', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('settles every unpaid order at the table through the atomic RPC', async () => {
    const auth = authWithRpc({ ok: true, settled_count: 2, amount_cents: 1850 })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      settled_count: 2,
      amount_cents: 1850,
    })
    expect(auth.supabase.rpc).toHaveBeenCalledWith('settle_dine_in_table', {
      p_table_id: TABLE_ID,
      p_method: 'cash',
      p_actor_id: 'staff-user-id',
      p_expected_order_ids: ORDER_IDS,
    })
  })

  it('returns 409 and settles nothing when the table changed during the confirm', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'stale_settle' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe('stale_settle')
    expect(body.error).toMatch(/review the new total/i)
  })

  it('reports a retried settle as success, not a conflict', async () => {
    // The first response was lost after commit; the retry finds nothing left
    // to charge. A 409 here would read as failure to every consumer.
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'nothing_to_settle' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      already_settled: true,
      settled_count: 0,
      amount_cents: 0,
    })
  })

  it('returns 400 for an unsupported method', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'invalid_method' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(400)
  })

  it('rejects a body without a valid payment method', async () => {
    const auth = authWithRpc({ ok: true })
    requireRoleMock.mockResolvedValue(auth)
    const response = await POST(
      makeRequest({ payment_method: 'credit_card' }) as never,
      context() as never
    )
    expect(response.status).toBe(400)
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects a body without the confirmed order ids', async () => {
    const auth = authWithRpc({ ok: true })
    requireRoleMock.mockResolvedValue(auth)
    const response = await POST(
      makeRequest({ payment_method: 'cash' }) as never,
      context() as never
    )
    expect(response.status).toBe(400)
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid table id', async () => {
    const auth = authWithRpc({ ok: true })
    requireRoleMock.mockResolvedValue(auth)
    const response = await POST(makeRequest() as never, context('nope') as never)
    expect(response.status).toBe(400)
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns 500 when the RPC itself fails', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc(null, { message: 'boom', code: 'XX000' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(500)
  })

  it('reports a missing RPC as a deployment problem, not a payment failure', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc(null, { message: 'function not found', code: 'PGRST202' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/migration 060/i)
  })

  it('propagates the role guard denial', async () => {
    const { NextResponse } = await import('next/server')
    requireRoleMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(403)
  })
})
