import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const mockStripeCheckoutCreate = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      checkout: {
        sessions: {
          create: mockStripeCheckoutCreate,
        },
      },
    }
  }),
}))

vi.mock('@/lib/validators/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_stripe',
    NEXT_PUBLIC_URL: 'https://test.example.com',
  },
}))

vi.mock('@/lib/bots/settings', () => ({
  getFreshBotSettings: vi.fn().mockResolvedValue({
    telegram_bot_enabled: true,
    whatsapp_bot_enabled: true,
    telegram_kitchen_group_chat_id: null,
    delivery_geofence_json: null,
    operating_hours: null,
    min_order_amount: 2000,
    store_name: 'Mad Krapow',
  }),
  isBotEnabled: vi.fn().mockReturnValue(true),
  getOperatingHoursForBot: vi.fn().mockReturnValue({ isOpen: true, open: null, close: null }),
}))

vi.mock('@/lib/bots/address', () => ({
  geocodeAddress: vi.fn().mockResolvedValue({ latitude: 3.0738, longitude: 101.5183, formatted_address: 'Test', place_id: 'test' }),
  isWithinDeliveryZone: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/bots/customer', () => ({
  findOrCreateBotCustomer: vi.fn().mockResolvedValue({ id: 'cust-1', name: 'John', phone: '+60123456789' }),
}))

vi.mock('@/lib/bots/conversation', () => ({
  clearSession: vi.fn().mockResolvedValue(undefined),
}))

function buildMockSupabaseClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const from = vi.fn().mockImplementation((table: string) => {
    const response = responses[table] ?? { data: null, error: null }

    function makeThenable(extraMethods: Record<string, unknown> = {}) {
      const obj = {
        ...extraMethods,
        then: (resolve: (v: typeof response) => unknown) => resolve(response),
      }
      return obj
    }

    const terminal = {
      single: vi.fn().mockResolvedValue(response),
      maybeSingle: vi.fn().mockResolvedValue(response),
      then: (resolve: (v: typeof response) => unknown) => resolve(response),
    }

    const order = vi.fn().mockReturnValue(makeThenable(terminal))
    const inFn = vi.fn().mockReturnValue(makeThenable({ order }))

    const eqReturn = makeThenable({
      order,
      single: terminal.single,
      maybeSingle: terminal.maybeSingle,
    })
    const eq = vi.fn().mockReturnValue(eqReturn)

    const limitReturn = makeThenable({
      single: terminal.single,
      maybeSingle: terminal.maybeSingle,
    })
    const limit = vi.fn().mockReturnValue(limitReturn)

    const selectReturn = makeThenable({
      eq,
      in: inFn,
      order,
      limit,
      single: terminal.single,
      maybeSingle: terminal.maybeSingle,
    })
    const select = vi.fn().mockReturnValue(selectReturn)

    return {
      select,
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(terminal),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue(terminal),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({}),
      }),
    }
  })

  return { from }
}

let mockSupabase = buildMockSupabaseClient({})

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}))

function createRequest(body: unknown): Request {
  return new Request('https://test.example.com/api/bots/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/bots/checkout', () => {
  beforeEach(() => {
    mockStripeCheckoutCreate.mockReset()
    mockSupabase = buildMockSupabaseClient({})
  })

  it('returns success with checkout URL for valid request', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 500, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: { id: '550e8400-e29b-41d4-a716-446655440001' }, error: null },
      orders: { data: { id: 'order-1' }, error: null },
      order_items: { data: [{ id: 'oi-1' }], error: null },
    })

    mockStripeCheckoutCreate.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/test',
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.checkoutUrl).toBe('https://checkout.stripe.com/test')
    expect(json.orderId).toBe('order-1')
    expect(json.orderNumber).toMatch(/^MK/)
  })

  it('returns error for invalid JSON', async () => {
    const req = new Request('https://test.example.com/api/bots/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('INVALID_JSON')
  })

  it('returns error for invalid request body', async () => {
    const req = createRequest({ platform: 'telegram' })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('INVALID_REQUEST')
  })

  it('returns error when bot is disabled', async () => {
    const { isBotEnabled } = await import('@/lib/bots/settings')
    vi.mocked(isBotEnabled).mockReturnValueOnce(false)

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('BOT_DISABLED')
  })

  it('returns error when store is closed', async () => {
    const { getOperatingHoursForBot } = await import('@/lib/bots/settings')
    vi.mocked(getOperatingHoursForBot).mockReturnValueOnce({ isOpen: false, open: '09:00', close: '17:00' })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('STORE_CLOSED')
  })

  it('returns error for outside delivery zone', async () => {
    const { isWithinDeliveryZone } = await import('@/lib/bots/address')
    vi.mocked(isWithinDeliveryZone).mockResolvedValueOnce(false)

    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 500, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
        latitude: 3.5,
        longitude: 101.5,
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('OUTSIDE_ZONE')
  })

  it('returns error when item is unavailable', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 500, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: false },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('ITEM_UNAVAILABLE')
  })

  it('returns error when modifier is unavailable', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 500, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: {
        data: [
          { id: 'mod-1', name: 'Extra Spicy', price_delta_cents: 100, is_available: false },
        ],
        error: null,
      },
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [{ modifierId: 'mod-1' }] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('MODIFIER_UNAVAILABLE')
  })

  it('returns error for invalid session', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 0, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: null, error: null },
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440002',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.code).toBe('INVALID_SESSION')
  })

  it('returns error when order creation fails', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 0, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: { id: '550e8400-e29b-41d4-a716-446655440001' }, error: null },
      orders: { data: null, error: { message: 'db error' } },
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.code).toBe('ORDER_FAILED')
  })

  it('returns error when Stripe session has no URL', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 0, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: { id: '550e8400-e29b-41d4-a716-446655440001' }, error: null },
      orders: { data: { id: 'order-1' }, error: null },
      order_items: { data: [{ id: 'oi-1' }], error: null },
    })

    mockStripeCheckoutCreate.mockResolvedValue({
      id: 'cs_test',
      url: null,
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.code).toBe('SESSION_FAILED')
  })

  it('returns error when order items insertion fails', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 0, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: { id: '550e8400-e29b-41d4-a716-446655440001' }, error: null },
      orders: { data: { id: 'order-1' }, error: null },
      order_items: { data: null, error: { message: 'items error' } },
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.code).toBe('ITEMS_FAILED')
  })

  it('handles self pickup with no delivery fee', async () => {
    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 500, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: { id: '550e8400-e29b-41d4-a716-446655440001' }, error: null },
      orders: { data: { id: 'order-1' }, error: null },
      order_items: { data: [{ id: 'oi-1' }], error: null },
    })

    mockStripeCheckoutCreate.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/test',
    })

    const req = createRequest({
      platform: 'whatsapp',
      platformUserId: '60123456789',
      items: [{ menuItemId: 'item-1', quantity: 2, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'Jane',
      contactPhone: '+60123456789',
      deliveryType: 'self_pickup',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('handles geocoding failure gracefully', async () => {
    const { geocodeAddress } = await import('@/lib/bots/address')
    vi.mocked(geocodeAddress).mockRejectedValueOnce(new Error('Geocoding failed'))

    mockSupabase = buildMockSupabaseClient({
      store_settings: { data: { delivery_fee: 500, kitchen_lead_minutes: 20, cutlery_enabled: true, cutlery_default: true }, error: null },
      menu_items: {
        data: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, image_url: null, is_available: true },
        ],
        error: null,
      },
      modifiers: { data: [], error: null },
      bot_sessions: { data: { id: '550e8400-e29b-41d4-a716-446655440001' }, error: null },
      orders: { data: { id: 'order-1' }, error: null },
      order_items: { data: [{ id: 'oi-1' }], error: null },
    })

    mockStripeCheckoutCreate.mockResolvedValue({
      id: 'cs_test',
      url: 'https://checkout.stripe.com/test',
    })

    const req = createRequest({
      platform: 'telegram',
      platformUserId: '12345',
      items: [{ menuItemId: 'item-1', quantity: 1, modifiers: [] }],
      deliveryAddress: {
        address_line1: '123 Main St',
        city: 'Shah Alam',
        state: 'Selangor',
        postal_code: '40150',
      },
      contactName: 'John',
      contactPhone: '+60123456789',
      deliveryType: 'delivery',
      sessionId: '550e8400-e29b-41d4-a716-446655440001',
    })

    const response = await POST(req as never)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
  })
})
