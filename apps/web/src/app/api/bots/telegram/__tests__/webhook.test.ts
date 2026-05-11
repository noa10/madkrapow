import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../webhook/route'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/validators/env', () => ({
  env: {
    TELEGRAM_WEBHOOK_SECRET: 'secret-token',
    NEXT_PUBLIC_URL: 'https://test.example.com',
    TELEGRAM_BOT_TOKEN: 'bot-token',
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

vi.mock('@/lib/bots/conversation', () => ({
  getOrCreateSession: vi.fn().mockResolvedValue({
    id: 'sess-1',
    platform: 'telegram',
    platform_user_id: '12345',
    current_state: 'idle',
    cart_json: [],
    address_json: null,
    contact_json: null,
    selected_item_id: null,
    selected_modifier_group_index: null,
    language: 'en',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    last_interaction_at: new Date().toISOString(),
  }),
  updateState: vi.fn().mockResolvedValue(undefined),
  addToCart: vi.fn().mockResolvedValue(undefined),
  removeFromCart: vi.fn().mockResolvedValue(undefined),
  getCart: vi.fn().mockResolvedValue([]),
  clearSession: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/bots/customer', () => ({
  findOrCreateBotCustomer: vi.fn().mockResolvedValue({ id: 'cust-1', name: 'John' }),
  updateBotCustomerContact: vi.fn().mockResolvedValue({ id: 'cust-1' }),
}))

vi.mock('@/lib/bots/menu', () => ({
  getBotMenu: vi.fn().mockResolvedValue([
    {
      id: 'cat-1',
      name: 'Mains',
      items: [
        { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, description: null, is_available: true, has_modifiers: false },
      ],
    },
  ]),
  getBotItemWithModifiers: vi.fn().mockResolvedValue({
    id: 'item-1',
    name: 'Nasi Goreng',
    price_cents: 1200,
    description: null,
    is_available: true,
    category_id: 'cat-1',
    sort_order: 1,
    image_url: null,
    category: { id: 'cat-1', name: 'Mains' },
    modifier_groups: [],
  }),
  formatBotMenuText: vi.fn().mockReturnValue('*Menu*\n\n*Mains*\n  Nasi Goreng — RM 12.00'),
  formatBotItemDetails: vi.fn().mockReturnValue('*Nasi Goreng*\nRM 12.00'),
}))

vi.mock('@/lib/bots/address', () => ({
  parseAddressInput: vi.fn().mockReturnValue({
    address_line1: '123 Main St',
    city: 'Shah Alam',
    state: 'Selangor',
    postal_code: '40150',
    country: 'Malaysia',
  }),
  validateAddress: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
  geocodeAddress: vi.fn().mockResolvedValue({ latitude: 3.0738, longitude: 101.5183, formatted_address: 'Test', place_id: 'test' }),
  isWithinDeliveryZone: vi.fn().mockResolvedValue(true),
  formatAddressForBot: vi.fn().mockReturnValue('123 Main St, Shah Alam, Selangor, 40150, Malaysia'),
}))

function buildMockSupabaseClient(response: { data: unknown; error: unknown }) {
  const limitReturn = {
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
  }
  const orderReturn = {
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    limit: vi.fn().mockReturnValue(limitReturn),
  }
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(orderReturn),
        }),
        order: vi.fn().mockReturnValue(orderReturn),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(response),
        }),
      }),
    }),
  }
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => buildMockSupabaseClient({ data: null, error: null })),
}))

function createRequest(body: unknown, headers?: Record<string, string>): Request {
  return new Request('https://test.example.com/api/bots/telegram/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/bots/telegram/webhook', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  })

  it('rejects invalid secret token', async () => {
    const req = createRequest({ update_id: 1, message: { chat: { id: 123 }, from: { id: 123, first_name: 'Test' }, text: '/start' } }, {
      'x-telegram-bot-api-secret-token': 'wrong-token',
    })

    const response = await POST(req as never)
    expect(response.status).toBe(401)
  })

  it('returns 200 for missing message and callback', async () => {
    const req = createRequest({ update_id: 1 }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles /start command', async () => {
    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/start',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalled()
  })

  it('handles /menu command', async () => {
    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/menu',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles /cart command with empty cart', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([])

    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/cart',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles /help command', async () => {
    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/help',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles /cancel command', async () => {
    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/cancel',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles /status command', async () => {
    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/status',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles unknown command', async () => {
    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/unknown',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles menu callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'menu',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles category callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'cat:cat-1',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles item callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'item:item-1',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles add to cart callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'add:item-1',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles cart callback', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'cart',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles cart increment callback', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'inc:0',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles cart decrement callback', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 2, modifiers: [] },
    ])

    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'dec:0',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles cart remove callback', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'rem:0',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles checkout callback', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'checkout',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles confirm callback with checkout API', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'telegram',
      platform_user_id: '12345',
      current_state: 'confirming_order',
      cart_json: [],
      address_json: { address_line1: '123 Main St', city: 'Shah Alam', state: 'Selangor', postal_code: '40150' },
      contact_json: { name: 'John', phone: '+60123456789' },
      selected_item_id: null,
      selected_modifier_group_index: null,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, checkoutUrl: 'https://pay.test', orderId: 'order-1', orderNumber: 'MK001' }),
    })

    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'confirm',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles help callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'help',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles cancel callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'cancel',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles status callback', async () => {
    const req = createRequest({
      update_id: 1,
      callback_query: {
        id: 'cq-1',
        from: { id: 123, first_name: 'John' },
        message: { message_id: 1, chat: { id: 123, type: 'private' } },
        data: 'status',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles address input in entering_address state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'telegram',
      platform_user_id: '12345',
      current_state: 'entering_address',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: null,
      selected_modifier_group_index: null,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '123 Main St, Shah Alam, Selangor, 40150',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles contact input in entering_contact state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'telegram',
      platform_user_id: '12345',
      current_state: 'entering_contact',
      cart_json: [],
      address_json: { address_line1: '123 Main St', city: 'Shah Alam', state: 'Selangor', postal_code: '40150' },
      contact_json: null,
      selected_item_id: null,
      selected_modifier_group_index: null,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: 'John Doe +60123456789',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles text in browsing_menu state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'telegram',
      platform_user_id: '12345',
      current_state: 'browsing_menu',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: null,
      selected_modifier_group_index: null,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: 'hello',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('returns 200 when bot is unavailable', async () => {
    const { isBotEnabled } = await import('@/lib/bots/settings')
    vi.mocked(isBotEnabled).mockReturnValueOnce(false)

    const req = createRequest({
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 123, type: 'private' },
        from: { id: 123, first_name: 'John' },
        date: Date.now(),
        text: '/start',
      },
    }, { 'x-telegram-bot-api-secret-token': 'secret-token' })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles invalid JSON gracefully', async () => {
    const req = new Request('https://test.example.com/api/bots/telegram/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': 'secret-token' },
      body: 'not-json',
    })

    const response = await POST(req as never)
    expect(response.status).toBe(400)
  })
})
