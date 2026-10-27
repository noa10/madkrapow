import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/tables', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

function authWithInsert(result: { data: unknown; error: unknown }) {
  const inserted: Record<string, unknown>[] = []
  return {
    inserted,
    user: { id: 'admin-user' },
    supabase: {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row)
          return {
            select: () => ({
              single: async () => result,
            }),
          }
        },
      }),
    },
  }
}

describe('POST /api/admin/tables', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('creates a table with a generated 32-hex QR token', async () => {
    const auth = authWithInsert({
      data: {
        id: 'table-1',
        label: 'T1',
        zone: 'Indoor',
        seats: 4,
        qr_token: 'a'.repeat(32),
        is_active: true,
        sort_order: 0,
      },
      error: null,
    })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(
      makeRequest({
        label: 'T1',
        zone: 'Indoor',
        seats: 4,
        // A crafted token must be ignored: tokens are server-generated.
        qr_token: 'known-token',
      }) as never
    )

    expect(response.status).toBe(201)
    expect(auth.inserted).toHaveLength(1)
    expect(auth.inserted[0]).toMatchObject({ label: 'T1', zone: 'Indoor', seats: 4 })
    expect(auth.inserted[0].qr_token).toMatch(/^[0-9a-f]{32}$/)
    expect(auth.inserted[0].qr_token).not.toBe('known-token')
  })

  it('rejects an empty label', async () => {
    requireRoleMock.mockResolvedValue(authWithInsert({ data: null, error: null }))
    const response = await POST(makeRequest({ label: '   ' }) as never)
    expect(response.status).toBe(400)
  })

  it('returns 409 for a duplicate label', async () => {
    requireRoleMock.mockResolvedValue(
      authWithInsert({ data: null, error: { code: '23505' } })
    )
    const response = await POST(makeRequest({ label: 'T1' }) as never)
    expect(response.status).toBe(409)
  })

  it('propagates the role guard denial', async () => {
    const { NextResponse } = await import('next/server')
    requireRoleMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const response = await POST(makeRequest({ label: 'T1' }) as never)
    expect(response.status).toBe(403)
  })
})
