import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const TABLE_ID = '44444444-4444-4444-8444-444444444444'

function makeRequest(body: unknown = { reason: 'closed by mistake' }): Request {
  return new Request(`http://localhost/api/pos/tables/${TABLE_ID}/reopen`, {
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
    user: { id: 'manager-user-id' },
    supabase: {
      rpc: vi.fn().mockResolvedValue({ data: result, error }),
    },
  }
}

describe('POST /api/pos/tables/[id]/reopen', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('reopens through the RPC with admin/manager only', async () => {
    const auth = authWithRpc({ ok: true, reopened: 2 })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, reopened: 2 })
    expect(requireRoleMock).toHaveBeenCalledWith(expect.anything(), [
      'admin',
      'manager',
    ])
    expect(auth.supabase.rpc).toHaveBeenCalledWith('reopen_dine_in_table', {
      p_table_id: TABLE_ID,
      p_actor_id: 'manager-user-id',
      p_reason: 'closed by mistake',
    })
  })

  it('returns 409 when nothing was closed at the table today', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'not_closed' }))
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.code).toBe('not_closed')
    expect(json.error).toMatch(/nothing/i)
  })

  it('returns 409 when a new party already occupies the table', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'occupied' }))
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.code).toBe('occupied')
    expect(json.error).toMatch(/open orders/i)
  })

  it('returns 404 for a missing table', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'not_found' }))
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(404)
  })

  it('maps the RPC reason guard to a 400', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc({ ok: false, code: 'reason_required' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(400)
  })

  it('rejects a blank reason before calling the RPC', async () => {
    const auth = authWithRpc({ ok: true, reopened: 0 })
    requireRoleMock.mockResolvedValue(auth)
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 42 }]) {
      const response = await POST(makeRequest(body) as never, context() as never)
      expect(response.status).toBe(400)
    }
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
    expect(requireRoleMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid table id', async () => {
    const auth = authWithRpc({ ok: true, reopened: 0 })
    requireRoleMock.mockResolvedValue(auth)
    const response = await POST(makeRequest() as never, context('nope') as never)
    expect(response.status).toBe(400)
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns 500 when the RPC errors', async () => {
    requireRoleMock.mockResolvedValue(
      authWithRpc(null, { message: 'boom' })
    )
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(500)
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
