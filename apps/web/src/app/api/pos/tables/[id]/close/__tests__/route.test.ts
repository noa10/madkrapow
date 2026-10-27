import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const TABLE_ID = '44444444-4444-4444-8444-444444444444'

function makeRequest(): Request {
  return new Request(`http://localhost/api/pos/tables/${TABLE_ID}/close`, {
    method: 'POST',
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

describe('POST /api/pos/tables/[id]/close', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('closes the table through the atomic RPC', async () => {
    const auth = authWithRpc({ ok: true, closed: 2 })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, closed: 2 })
    expect(auth.supabase.rpc).toHaveBeenCalledWith('close_dine_in_table', {
      p_table_id: TABLE_ID,
      p_actor_id: 'staff-user-id',
    })
  })

  it('returns 409 for an unpaid table', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'unpaid' }))
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/collect payment/i)
  })

  it('returns 409 while the kitchen is still working', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'not_ready' }))
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/ready/i)
  })

  it('returns 404 for a missing table', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'not_found' }))
    const response = await POST(makeRequest() as never, context() as never)
    expect(response.status).toBe(404)
  })

  it('rejects an invalid table id', async () => {
    const auth = authWithRpc({ ok: true, closed: 0 })
    requireRoleMock.mockResolvedValue(auth)
    const response = await POST(makeRequest() as never, context('nope') as never)
    expect(response.status).toBe(400)
    expect(auth.supabase.rpc).not.toHaveBeenCalled()
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
