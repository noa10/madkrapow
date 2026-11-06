import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  getServiceClient: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  getServiceClient: mocks.getServiceClient,
}))

import { POST } from '../route'

const ITEM = '00000004-0000-0000-0000-000000000005'
const MODIFIER = '00000003-0000-0000-0000-000000000001'
const USER = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = '22222222-2222-4222-8222-222222222222'

const body = {
  items: [{ id: ITEM, quantity: 3, modifiers: [{ id: MODIFIER }] }],
  bulkFields: {
    company_name: 'Example Co',
    requested_date: '2099-01-10',
    requested_time: '12:30',
    budget: 125,
    contact_phone: '0123456789',
  },
  deliveryAddress: { address: '1 Test Street' },
  deliveryType: 'delivery',
}

function makeRequest(value: unknown) {
  return new Request('http://localhost/api/checkout/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  }) as never
}

function builder(data: unknown, error: unknown = null) {
  const result = { data, error }
  const query = {
    select: () => query,
    limit: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  }
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  const client = {
    from: vi.fn((table: string) => {
      if (table === 'store_settings') {
        return builder({ bulk_enabled: true, bulk_min_notice_hours: 48, kitchen_lead_minutes: 25 })
      }
      if (table === 'customers') return builder({ id: CUSTOMER })
      if (table === 'menu_items') return builder([{ id: ITEM, name: 'Krapow', is_available: true }])
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
  mocks.getAuthenticatedUser.mockResolvedValue({
    user: { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' },
    supabase: client,
  })
  mocks.getServiceClient.mockReturnValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: { order_id: 'order-1' }, error: null })
})

describe('POST /api/checkout/bulk', () => {
  it('submits identifiers and quantities, converting RM budget to cents', async () => {
    const response = await POST(makeRequest(body))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, orderId: 'order-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('submit_bulk_order', {
      p_auth_user_id: USER,
      p_customer_id: CUSTOMER,
      p_order: expect.objectContaining({
        company_name: 'Example Co',
        budget_cents: 12500,
        delivery_type: 'delivery',
        delivery_address: { address: '1 Test Street' },
        kitchen_lead_minutes: 25,
        // 12:30 in Kuala Lumpur, not 12:30 UTC (Vercel's runtime timezone).
        scheduled_for: '2099-01-10T04:30:00.000Z',
      }),
      p_items: [{ menu_item_id: ITEM, quantity: 3, modifier_ids: [MODIFIER] }],
    })
  })

  it('ignores legacy client-provided names and prices', async () => {
    const response = await POST(makeRequest({
      ...body,
      items: [{
        id: ITEM,
        name: 'Untrusted dish',
        price: 1,
        quantity: 3,
        modifiers: [{ id: MODIFIER, name: 'Untrusted option', price_delta_cents: -9999 }],
      }],
    }))

    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_items).toEqual([
      { menu_item_id: ITEM, quantity: 3, modifier_ids: [MODIFIER] },
    ])
  })

  it('preserves an explicitly supplied zero budget', async () => {
    const response = await POST(makeRequest({
      ...body,
      bulkFields: { ...body.bulkFields, budget: 0 },
    }))

    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_order.budget_cents).toBe(0)
  })

  it.each([
    ['bulk_items_failed', 500, 'ITEMS_FAILED'],
    ['bulk_item_unavailable', 400, 'ITEM_UNAVAILABLE'],
    ['bulk_invalid_modifier', 400, 'MODIFIER_UNAVAILABLE'],
    ['bulk_invalid_order', 400, 'INVALID_REQUEST'],
    ['bulk_invalid_items', 400, 'INVALID_REQUEST'],
    ['bulk_invalid_item', 400, 'INVALID_REQUEST'],
    ['bulk_total_too_large', 400, 'INVALID_REQUEST'],
    ['bulk_customer_mismatch', 403, 'UNAUTHORIZED'],
    ['unexpected database error', 500, 'ORDER_FAILED'],
  ])('maps transaction error %s safely', async (message, status, code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message, details: 'internal detail' } })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(status)
    expect(mocks.rpc).toHaveBeenCalledOnce()
    const result = await response.json()
    expect(result).toMatchObject({ success: false, code })
    expect(JSON.stringify(result)).not.toContain('internal detail')
  })

  it('keeps the size message for the total-ceiling guard only', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'bulk_total_too_large', details: 'internal detail' },
    })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/too large.*split/i)
  })

  it.each(['bulk_invalid_order', 'bulk_invalid_items', 'bulk_invalid_item'])(
    'does not disguise %s as a size problem',
    async (message) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { message, details: 'internal detail' },
      })

      const response = await POST(makeRequest(body))

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.code).toBe('INVALID_REQUEST')
      expect(result.error).toBe('Unable to create order. Please try again.')
      expect(JSON.stringify(result)).not.toContain('internal detail')
    }
  )

  it('reports a menu lookup failure as a lookup failure, not a price check', async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      user: { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' },
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'store_settings') {
            return builder({ bulk_enabled: true, bulk_min_notice_hours: 48, kitchen_lead_minutes: 25 })
          }
          if (table === 'customers') return builder({ id: CUSTOMER })
          if (table === 'menu_items') return builder(null, { message: 'lookup failed' })
          throw new Error(`Unexpected table: ${table}`)
        }),
      },
    })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'ITEM_LOOKUP_FAILED',
      error: 'Unable to check item availability',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('distinguishes a failed customer lookup from profile creation', async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      user: { id: USER, email_confirmed_at: '2026-01-01T00:00:00Z' },
      supabase: {
        from: vi.fn((table: string) => {
          if (table === 'store_settings') {
            return builder({ bulk_enabled: true, bulk_min_notice_hours: 48, kitchen_lead_minutes: 25 })
          }
          if (table === 'customers') return builder(null, { message: 'lookup failed' })
          throw new Error(`Unexpected table: ${table}`)
        }),
      },
    })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      success: false,
      code: 'CUSTOMER_FAILED',
      error: 'Unable to load your customer profile',
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects an unverified account before calling the transaction', async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ user: { id: USER }, supabase: {} })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('EMAIL_NOT_VERIFIED')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['an oversized quantity', { ...body, items: [{ id: ITEM, quantity: 1001 }] }, 'INVALID_REQUEST'],
    ['an invalid date', { ...body, bulkFields: { ...body.bulkFields, requested_date: 'invalid' } }, 'INVALID_REQUEST'],
    ['too little notice', { ...body, bulkFields: { ...body.bulkFields, requested_date: '2000-01-01' } }, 'INSUFFICIENT_NOTICE'],
  ])('rejects %s before calling the transaction', async (_label, requestBody, code) => {
    const response = await POST(makeRequest(requestBody))

    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe(code)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns an error if the transaction returns no order', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(500)
    expect((await response.json()).code).toBe('ORDER_FAILED')
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('rejects unauthenticated submissions before calling the transaction', async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({ user: null, supabase: null })

    const response = await POST(makeRequest(body))

    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
