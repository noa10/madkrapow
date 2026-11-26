import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { GET, PATCH } from '../route'

const STORE_ROW = {
  id: 'store-settings-1',
  receipt_store_name: 'Mad Krapow Subang Permai',
  address: '52, Jalan Subang Permai, Subang Jaya',
  phone: '+60193456476',
  company_name: 'Bakaris Enterprise',
  company_registration: '201903057932',
  receipt_footer: 'Powered by Mad Krapow',
  // PostgREST returns NUMERIC as a string, so the route must coerce it.
  tax_rate_percent: '6.00',
  receipt_paper_width: '80',
  auto_print_enabled: true,
}

function makeRequest(
  body?: unknown,
  init: { method?: string; rawBody?: string } = {}
): Request {
  const method = init.method ?? 'GET'
  return new Request('http://localhost/api/admin/print-settings', {
    method,
    body:
      init.rawBody !== undefined
        ? init.rawBody
        : body === undefined
          ? undefined
          : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

interface StoreOptions {
  readError?: unknown
  updateError?: unknown
  missingRow?: boolean
}

function makeAuth(initial: Record<string, unknown> = STORE_ROW, options: StoreOptions = {}) {
  const row: Record<string, unknown> = { ...initial }
  const updates: Record<string, unknown>[] = []

  const supabase = {
    from: (table: string) => {
      if (table !== 'store_settings') {
        throw new Error(`unexpected table: ${table}`)
      }
      return {
        select: () => {
          const query = {
            // The route pins the oldest row so a second (demo) store_settings
            // row cannot hijack the settings.
            order: () => query,
            limit: () => query,
            maybeSingle: async () =>
              options.readError || options.missingRow
                ? { data: null, error: options.readError ?? null }
                : { data: { ...row }, error: null },
            single: async () =>
              options.readError || options.missingRow
                ? { data: null, error: options.readError ?? null }
                : { data: { id: row.id }, error: null },
          }
          return query
        },
        update: (payload: Record<string, unknown>) => {
          updates.push(payload)
          const query = {
            eq: () => query,
            select: () => query,
            single: async () => {
              if (options.updateError) {
                return { data: null, error: options.updateError }
              }
              Object.assign(row, payload)
              return { data: { ...row }, error: null }
            },
          }
          return query
        },
      }
    },
  }

  return { user: { id: 'admin-user' }, supabase, row, updates }
}

describe('GET /api/admin/print-settings', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('returns the current settings, normalized, with no-store', async () => {
    requireRoleMock.mockResolvedValue(makeAuth())

    const response = await GET(makeRequest() as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(requireRoleMock).toHaveBeenCalledWith(expect.anything(), ['admin'])
    expect(body).toEqual({
      receipt_store_name: 'Mad Krapow Subang Permai',
      address: '52, Jalan Subang Permai, Subang Jaya',
      phone: '+60193456476',
      company_name: 'Bakaris Enterprise',
      company_registration: '201903057932',
      receipt_footer: 'Powered by Mad Krapow',
      tax_rate_percent: 6,
      receipt_paper_width: '80',
      auto_print_enabled: true,
    })
  })

  it('defaults missing values instead of leaking nulls', async () => {
    requireRoleMock.mockResolvedValue(
      makeAuth({
        id: 'store-settings-1',
        receipt_store_name: null,
        address: null,
        phone: null,
        company_name: null,
        company_registration: null,
        receipt_footer: null,
        tax_rate_percent: null,
        receipt_paper_width: null,
        auto_print_enabled: null,
      })
    )

    const response = await GET(makeRequest() as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.receipt_store_name).toBe('')
    expect(body.tax_rate_percent).toBe(0)
    expect(body.receipt_paper_width).toBe('80')
    expect(body.auto_print_enabled).toBe(true)
  })

  it('rejects non-admins with the requireRole response', async () => {
    requireRoleMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await GET(makeRequest() as never)

    expect(response.status).toBe(403)
  })

  it('returns 500 when the settings row cannot be read', async () => {
    requireRoleMock.mockResolvedValue(makeAuth(STORE_ROW, { readError: { message: 'boom' } }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(makeRequest() as never)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Failed to load receipt settings' })
  })
})

describe('PATCH /api/admin/print-settings', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('updates only the provided fields and returns the saved settings', async () => {
    const auth = makeAuth()
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest(
        { receipt_store_name: 'Mad Krapow USJ', auto_print_enabled: false },
        { method: 'PATCH' }
      ) as never
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(auth.updates).toEqual([
      { receipt_store_name: 'Mad Krapow USJ', auto_print_enabled: false },
    ])
    expect(body.success).toBe(true)
    expect(body.settings.receipt_store_name).toBe('Mad Krapow USJ')
    expect(body.settings.auto_print_enabled).toBe(false)
    // Untouched fields survive.
    expect(body.settings.company_name).toBe('Bakaris Enterprise')
  })

  it('lets a later GET see the patched values', async () => {
    const auth = makeAuth()
    requireRoleMock.mockResolvedValue(auth)

    await PATCH(
      makeRequest({ receipt_footer: '', receipt_paper_width: '58' }, { method: 'PATCH' }) as never
    )
    const response = await GET(makeRequest() as never)
    const body = await response.json()

    expect(body.receipt_footer).toBe('')
    expect(body.receipt_paper_width).toBe('58')
  })

  it('accepts boundary SST rates', async () => {
    const auth = makeAuth()
    requireRoleMock.mockResolvedValue(auth)

    const zero = await PATCH(makeRequest({ tax_rate_percent: 0 }, { method: 'PATCH' }) as never)
    const hundred = await PATCH(
      makeRequest({ tax_rate_percent: 100 }, { method: 'PATCH' }) as never
    )

    expect(zero.status).toBe(200)
    expect(hundred.status).toBe(200)
    expect(auth.updates).toEqual([{ tax_rate_percent: 0 }, { tax_rate_percent: 100 }])
  })

  const invalidCases: Array<[string, Record<string, unknown>]> = [
    ['empty receipt name', { receipt_store_name: '' }],
    ['receipt name too long', { receipt_store_name: 'x'.repeat(81) }],
    ['address too long', { address: 'x'.repeat(201) }],
    ['phone too long', { phone: '1'.repeat(31) }],
    ['company name too long', { company_name: 'x'.repeat(81) }],
    ['registration too long', { company_registration: 'x'.repeat(41) }],
    ['footer too long', { receipt_footer: 'x'.repeat(121) }],
    ['negative SST rate', { tax_rate_percent: -1 }],
    ['SST rate over 100', { tax_rate_percent: 101 }],
    ['SST rate as string', { tax_rate_percent: '6' }],
    ['unknown paper width', { receipt_paper_width: '72' }],
    ['non-boolean auto print', { auto_print_enabled: 'yes' }],
    ['unknown key', { kitchen_printer_ip: '192.168.1.50' }],
  ]

  it.each(invalidCases)('rejects %s', async (_label, body) => {
    const auth = makeAuth()
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(makeRequest(body, { method: 'PATCH' }) as never)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.success).toBe(false)
    expect(payload.error).toBe('Invalid request')
    expect(auth.updates).toEqual([])
  })

  it('rejects an empty patch', async () => {
    const auth = makeAuth()
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(makeRequest({}, { method: 'PATCH' }) as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ success: false, error: 'No fields to update' })
    expect(auth.updates).toEqual([])
  })

  it('rejects malformed JSON', async () => {
    requireRoleMock.mockResolvedValue(makeAuth())

    const response = await PATCH(
      makeRequest(undefined, { method: 'PATCH', rawBody: '{not json' }) as never
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ success: false, error: 'Invalid JSON body' })
  })

  it('rejects non-admins before touching the database', async () => {
    requireRoleMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await PATCH(
      makeRequest({ receipt_store_name: 'Hacked' }, { method: 'PATCH' }) as never
    )

    expect(response.status).toBe(403)
  })

  it('returns 500 when the update fails', async () => {
    requireRoleMock.mockResolvedValue(
      makeAuth(STORE_ROW, { updateError: { message: 'write failed' } })
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await PATCH(
      makeRequest({ receipt_store_name: 'Mad Krapow USJ' }, { method: 'PATCH' }) as never
    )
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Failed to update receipt settings' })
  })
})
