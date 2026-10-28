import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const TABLE_ID = '44444444-4444-4444-8444-444444444444'

function makeRequest(): Request {
  return new Request(
    `http://localhost/api/admin/tables/${TABLE_ID}/rotate-token`,
    { method: 'POST' }
  ) as unknown as Request
}

function context(id = TABLE_ID) {
  return { params: Promise.resolve({ id }) }
}

function authWithUpdate(result: { data?: unknown; error?: unknown }) {
  const events: Record<string, unknown>[] = []
  return {
    events,
    user: { id: 'admin-user' },
    supabase: {
      from: (table: string) => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: async () => result,
            }),
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          if (table === 'table_events') events.push(row)
          return { error: null }
        },
      }),
    },
  }
}

describe('POST /api/admin/tables/[id]/rotate-token', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('rotates the token and records the audit event', async () => {
    const auth = authWithUpdate({
      data: { id: TABLE_ID, label: 'T1', qr_token: 'b'.repeat(32) },
    })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(makeRequest() as never, context() as never)

    expect(response.status).toBe(200)
    expect((await response.json()).table.qr_token).toBe('b'.repeat(32))
    expect(auth.events).toEqual([
      {
        table_id: TABLE_ID,
        table_label: 'T1',
        event_type: 'token_rotated',
        actor_id: 'admin-user',
        details: {},
      },
    ])
  })

  it('returns 404 for a missing table without recording an event', async () => {
    const auth = authWithUpdate({ data: null })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(makeRequest() as never, context() as never)

    expect(response.status).toBe(404)
    expect(auth.events).toEqual([])
  })

  it('rejects an invalid id without calling the database', async () => {
    const auth = authWithUpdate({ data: null })
    requireRoleMock.mockResolvedValue(auth)

    const response = await POST(makeRequest() as never, context('nope') as never)

    expect(response.status).toBe(400)
    expect(auth.events).toEqual([])
  })
})
