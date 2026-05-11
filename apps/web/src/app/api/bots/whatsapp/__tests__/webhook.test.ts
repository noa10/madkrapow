import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '../webhook/route'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('@/lib/validators/env', () => ({
  env: {
    WHATSAPP_VERIFY_TOKEN: 'verify-token',
    NEXT_PUBLIC_URL: 'https://test.example.com',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    WHATSAPP_ACCESS_TOKEN: 'access-token',
  },
}))

vi.mock('@/lib/bots/whatsapp', () => ({
  sendWhatsAppTextMessage: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppListMessage: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppReplyButtons: vi.fn().mockResolvedValue(undefined),
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
    platform: 'whatsapp',
    platform_user_id: '60123456789',
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
  updateState: vi.fn().mockImplementation((_sessionId, newState, data) => {
    return Promise.resolve({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: newState,
      cart_json: [],
      address_json: data?.address ?? null,
      contact_json: data?.contact ?? null,
      selected_item_id: data?.selectedItemId ?? null,
      selected_modifier_group_index: data?.selectedModifierGroupIndex ?? null,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })
  }),
  addToCart: vi.fn().mockResolvedValue(undefined),
  clearSession: vi.fn().mockResolvedValue(undefined),
  getCart: vi.fn().mockResolvedValue([]),
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
        { id: 'item-2', name: 'Mee Goreng', price_cents: 1300, description: null, is_available: true, has_modifiers: true },
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

function buildMockSupabaseClient(responses: Record<string, { data: unknown; error: unknown }>) {
  const from = vi.fn().mockImplementation((table: string) => {
    const response = responses[table] ?? { data: null, error: null }

    const terminal = {
      single: vi.fn().mockResolvedValue(response),
      maybeSingle: vi.fn().mockResolvedValue(response),
      then: (resolve: (v: typeof response) => unknown) => resolve(response),
    }

    const makeThenable = (extra: Record<string, unknown> = {}) => ({
      ...extra,
      then: (resolve: (v: typeof response) => unknown) => resolve(response),
    })

    const eq = vi.fn().mockImplementation(() => {
      const orderWithLimit = makeThenable({
        ...terminal,
        limit: vi.fn().mockReturnValue(makeThenable(terminal)),
      })
      return makeThenable({
        order: vi.fn().mockReturnValue(orderWithLimit),
        single: terminal.single,
        maybeSingle: terminal.maybeSingle,
        select: vi.fn().mockReturnValue(terminal),
      })
    })

    const order = vi.fn().mockReturnValue(makeThenable(terminal))
    const limit = vi.fn().mockReturnValue(makeThenable(terminal))

    return {
      select: vi.fn().mockReturnValue(makeThenable({
        eq,
        in: vi.fn().mockReturnValue(makeThenable({ order })),
        order,
        limit,
        single: terminal.single,
        maybeSingle: terminal.maybeSingle,
      })),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(terminal),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue(makeThenable({
          select: vi.fn().mockReturnValue(terminal),
        })),
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

function createPayload(overrides: {
  phone?: string
  name?: string
  messageType?: 'text' | 'interactive'
  textBody?: string
  interactiveType?: 'list_reply' | 'button_reply'
  replyId?: string
  replyTitle?: string
} = {}): unknown {
  const phone = overrides.phone ?? '60123456789'
  const name = overrides.name ?? 'John'
  const messageType = overrides.messageType ?? 'text'

  const message: Record<string, unknown> = {
    from: phone,
    id: 'msg-1',
    type: messageType,
  }

  if (messageType === 'text') {
    message.text = { body: overrides.textBody ?? 'hi' }
  } else if (messageType === 'interactive') {
    const reply: Record<string, unknown> = {
      id: overrides.replyId ?? 'cat:cat-1',
      title: overrides.replyTitle ?? 'Mains',
    }
    if (overrides.interactiveType === 'list_reply') {
      message.interactive = { type: 'list_reply', list_reply: reply }
    } else {
      message.interactive = { type: 'button_reply', button_reply: reply }
    }
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'business-id',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '60123456789',
                phone_number_id: 'phone-id',
              },
              contacts: [{ profile: { name }, wa_id: phone }],
              messages: [message],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }
}

function createRequest(body: unknown): Request {
  return new Request('https://test.example.com/api/bots/whatsapp/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/bots/whatsapp/webhook', () => {
  it('returns challenge for valid verification token', async () => {
    const req = new Request('https://test.example.com/api/bots/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=1234567890')
    const response = await GET(req as never)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toBe('1234567890')
  })

  it('returns 403 for invalid verification token', async () => {
    const req = new Request('https://test.example.com/api/bots/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=1234567890')
    const response = await GET(req as never)
    expect(response.status).toBe(403)
    const text = await response.text()
    expect(text).toBe('Verification failed')
  })

  it('returns 403 for missing mode', async () => {
    const req = new Request('https://test.example.com/api/bots/whatsapp/webhook?hub.verify_token=verify-token&hub.challenge=1234567890')
    const response = await GET(req as never)
    expect(response.status).toBe(403)
  })
})

describe('POST /api/bots/whatsapp/webhook', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    mockSupabase = buildMockSupabaseClient({})
  })

  it('returns 200 for missing message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'business-id', changes: [{ value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '60123456789', phone_number_id: 'phone-id' } }, field: 'messages' }] }],
    }
    const req = createRequest(payload)
    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('returns 200 when bot is disabled', async () => {
    const { isBotEnabled } = await import('@/lib/bots/settings')
    vi.mocked(isBotEnabled).mockReturnValueOnce(false)

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'hi' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Bot is currently unavailable.')
  })

  it('returns 200 when store is closed', async () => {
    const { getOperatingHoursForBot } = await import('@/lib/bots/settings')
    vi.mocked(getOperatingHoursForBot).mockReturnValueOnce({ isOpen: false, open: '09:00', close: '17:00' })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'hi' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'We are currently closed. Our hours today are 09:00 - 17:00.')
  })

  it('handles text "hi" — shows welcome', async () => {
    const { sendWhatsAppListMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'hi' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppListMessage).toHaveBeenCalled()
  })

  it('handles text "menu" — shows welcome', async () => {
    const { sendWhatsAppListMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'menu' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppListMessage).toHaveBeenCalled()
  })

  it('handles text "cart" with empty cart', async () => {
    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'cart' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Your cart is empty. Type *Menu* to browse our menu.')
  })

  it('handles text "cart" with items', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { sendWhatsAppReplyButtons } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'cart' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppReplyButtons).toHaveBeenCalled()
  })

  it('handles text "status" with no customer', async () => {
    mockSupabase = buildMockSupabaseClient({
      customers: { data: null, error: null },
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'status' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'You have no orders yet. Type *Menu* to place your first order!')
  })

  it('handles text "status" with orders', async () => {
    mockSupabase = buildMockSupabaseClient({
      customers: { data: { id: 'cust-1' }, error: null },
      orders: {
        data: [
          { order_number: 'MK001', status: 'PENDING', total_cents: 1200, created_at: '2026-01-01T00:00:00Z' },
        ],
        error: null,
      },
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'status' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalled()
    const callArg = vi.mocked(sendWhatsAppTextMessage).mock.calls[0][1]
    expect(callArg).toContain('MK001')
  })

  it('handles text "cancel" — clears session', async () => {
    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')
    const { clearSession: clearSessionReal } = await import('@/lib/bots/conversation')

    const req = createRequest(createPayload({ textBody: 'cancel' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(clearSessionReal).toHaveBeenCalled()
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Your session has been cleared. Type *Menu* to start over.')
  })

  it('handles interactive list_reply for category', async () => {
    const { sendWhatsAppListMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'cat:cat-1',
      replyTitle: 'Mains',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppListMessage).toHaveBeenCalled()
  })

  it('handles interactive list_reply for item without modifiers', async () => {
    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')
    const { addToCart } = await import('@/lib/bots/conversation')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'item:item-1',
      replyTitle: 'Nasi Goreng',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(addToCart).toHaveBeenCalled()
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Added *Nasi Goreng* to your cart.')
  })

  it('handles interactive list_reply for item with modifiers', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-2',
      name: 'Mee Goreng',
      price_cents: 1300,
      description: null,
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [
        {
          id: 'mg-1',
          name: 'Spiciness',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'mod-2', name: 'Spicy', price_delta_cents: 100, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    const { sendWhatsAppReplyButtons } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'item:item-2',
      replyTitle: 'Mee Goreng',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppReplyButtons).toHaveBeenCalled()
  })

  it('handles interactive button_reply for modifier', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-2',
      name: 'Mee Goreng',
      price_cents: 1300,
      description: null,
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [
        {
          id: 'mg-1',
          name: 'Spiciness',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'selecting_modifiers',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: 'item-2',
      selected_modifier_group_index: 0,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    mockSupabase = buildMockSupabaseClient({
      bot_sessions: { data: { cart_json: [] }, error: null },
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'mod:mod-1',
      replyTitle: 'Mild',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Added *Mee Goreng* to your cart.')
  })

  it('handles interactive button_reply cart:add_more', async () => {
    const { sendWhatsAppListMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'cart:add_more',
      replyTitle: 'Add More',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppListMessage).toHaveBeenCalled()
  })

  it('handles interactive button_reply cart:checkout', async () => {
    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'cart:checkout',
      replyTitle: 'Checkout',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Please enter your delivery address. Include street, city, state, and postal code.')
  })

  it('handles interactive button_reply confirm:pay with successful checkout', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'confirm:pay',
      replyTitle: 'Confirm & Pay',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', expect.stringContaining('https://pay.test'))
  })

  it('handles interactive button_reply confirm:pay with failed checkout', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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
      ok: false,
      json: async () => ({ success: false, error: 'Payment failed' }),
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'confirm:pay',
      replyTitle: 'Confirm & Pay',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Checkout failed: Payment failed')
  })

  it('handles text in entering_address state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: '123 Main St, Shah Alam, Selangor, 40150' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', expect.stringContaining('Great! Now please provide your name'))
  })

  it('handles invalid address input', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { validateAddress } = await import('@/lib/bots/address')
    vi.mocked(validateAddress).mockResolvedValueOnce({ valid: false, errors: ['Missing postal code'] })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: '123 Main St' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', expect.stringContaining('Invalid address'))
  })

  it('handles address outside delivery zone', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { isWithinDeliveryZone } = await import('@/lib/bots/address')
    vi.mocked(isWithinDeliveryZone).mockResolvedValueOnce(false)

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: '123 Main St, Shah Alam, Selangor, 40150' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, your address is outside our delivery zone. We currently only deliver to Shah Alam, Selangor.')
  })

  it('handles text in entering_contact state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { sendWhatsAppReplyButtons } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'John Doe\n+60123456789' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppReplyButtons).toHaveBeenCalled()
  })

  it('handles contact input missing name', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: '\n+60123456789' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', expect.stringContaining('Please provide your name'))
  })

  it('handles text "yes" in confirming_order state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, checkoutUrl: 'https://pay.test', orderId: 'order-1', orderNumber: 'MK001' }),
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'yes' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', expect.stringContaining('https://pay.test'))
  })

  it('handles text other than yes in confirming_order state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'no' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Please tap *Confirm & Pay* to proceed, or type *Cancel* to start over.')
  })

  it('handles text in awaiting_payment state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'awaiting_payment',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'hello' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Please complete your payment using the link above. Type *Menu* to start a new order.')
  })

  it('handles text in browsing_menu state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'random text' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Type *Menu* to see our menu, *Cart* to view your cart, *Status* to check your order, or *Cancel* to start over.')
  })

  it('handles text in selecting_modifiers state', async () => {
    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'selecting_modifiers',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: 'item-2',
      selected_modifier_group_index: 0,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'random' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Type *Menu* to see our menu, *Cart* to view your cart, *Status* to check your order, or *Cancel* to start over.')
  })

  it('handles empty menu', async () => {
    const { getBotMenu } = await import('@/lib/bots/menu')
    vi.mocked(getBotMenu).mockResolvedValueOnce([])

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'hi' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Our menu is currently empty. Please check back later!')
  })

  it('handles unavailable item selection', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-1',
      name: 'Nasi Goreng',
      price_cents: 1200,
      description: null,
      is_available: false,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'nasi-goreng',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [],
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'item:item-1',
      replyTitle: 'Nasi Goreng',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, *Nasi Goreng* is currently unavailable.')
  })

  it('handles invalid interactive reply', async () => {
    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'unknown:action',
      replyTitle: 'Unknown',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, I did not understand that selection.')
  })

  it('handles invalid JSON gracefully', async () => {
    const req = new Request('https://test.example.com/api/bots/whatsapp/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const response = await POST(req as never)
    expect(response.status).toBe(200)
  })

  it('handles non-text non-interactive message', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'business-id',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '60123456789', phone_number_id: 'phone-id' },
            contacts: [{ profile: { name: 'John' }, wa_id: '60123456789' }],
            messages: [{ from: '60123456789', id: 'msg-1', type: 'image' }],
          },
          field: 'messages',
        }],
      }],
    }

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(payload)
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, I can only process text and button messages right now.')
  })

  it('handles interactive with missing reply id', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'business-id',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '60123456789', phone_number_id: 'phone-id' },
            contacts: [{ profile: { name: 'John' }, wa_id: '60123456789' }],
            messages: [{
              from: '60123456789',
              id: 'msg-1',
              type: 'interactive',
              interactive: { type: 'list_reply', list_reply: { id: '', title: 'Empty' } },
            }],
          },
          field: 'messages',
        }],
      }],
    }

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(payload)
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, I did not understand that.')
  })

  it('handles showOrderStatus with customer but no orders', async () => {
    mockSupabase = buildMockSupabaseClient({
      customers: { data: { id: 'cust-1' }, error: null },
      orders: { data: [], error: null },
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({ textBody: 'status' }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'You have no recent orders. Type *Menu* to place your first order!')
  })

  it('handles category with no items', async () => {
    const { getBotMenu } = await import('@/lib/bots/menu')
    vi.mocked(getBotMenu).mockResolvedValueOnce([
      { id: 'cat-1', name: 'Mains', items: [] },
    ])

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'cat:cat-1',
      replyTitle: 'Mains',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, that category is empty or no longer available.')
  })

  it('handles modifier selection for item not in cart yet', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-2',
      name: 'Mee Goreng',
      price_cents: 1300,
      description: null,
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [
        {
          id: 'mg-1',
          name: 'Spiciness',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'selecting_modifiers',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: 'item-2',
      selected_modifier_group_index: 0,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    mockSupabase = buildMockSupabaseClient({
      bot_sessions: { data: { cart_json: [] }, error: null },
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'mod:mod-1',
      replyTitle: 'Mild',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Added *Mee Goreng* to your cart.')
  })

  it('handles invalid modifier selection', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-2',
      name: 'Mee Goreng',
      price_cents: 1300,
      description: null,
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [
        {
          id: 'mg-1',
          name: 'Spiciness',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'selecting_modifiers',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: 'item-2',
      selected_modifier_group_index: 0,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'mod:invalid-mod',
      replyTitle: 'Invalid',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Invalid option. Please try again.')
  })

  it('handles showModifierGroup with no available modifiers', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-2',
      name: 'Mee Goreng',
      price_cents: 1300,
      description: null,
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [
        {
          id: 'mg-1',
          name: 'Spiciness',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: false, is_default: false, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'selecting_modifiers',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: 'item-2',
      selected_modifier_group_index: 0,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    mockSupabase = buildMockSupabaseClient({
      bot_sessions: { data: { cart_json: [] }, error: null },
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'item:item-2',
      replyTitle: 'Mee Goreng',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Your cart is empty. Type *Menu* to browse our menu.')
  })

  it('handles showModifierGroup with more than 3 modifiers using list message', async () => {
    const { getBotItemWithModifiers } = await import('@/lib/bots/menu')
    vi.mocked(getBotItemWithModifiers).mockResolvedValueOnce({
      id: 'item-2',
      name: 'Mee Goreng',
      price_cents: 1300,
      description: null,
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-1', name: 'Mains' },
      modifier_groups: [
        {
          id: 'mg-1',
          name: 'Spiciness',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'mod-2', name: 'Medium', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'mod-3', name: 'Hot', price_delta_cents: 0, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'mod-4', name: 'Extra Hot', price_delta_cents: 100, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 4, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    })

    const { sendWhatsAppListMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'list_reply',
      replyId: 'item:item-2',
      replyTitle: 'Mee Goreng',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppListMessage).toHaveBeenCalled()
  })

  it('handles handleConfirmation with missing address', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'confirming_order',
      cart_json: [],
      address_json: null,
      contact_json: { name: 'John', phone: '+60123456789' },
      selected_item_id: null,
      selected_modifier_group_index: null,
      language: 'en',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_interaction_at: new Date().toISOString(),
    })

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'confirm:pay',
      replyTitle: 'Confirm & Pay',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Please provide your delivery address first.')
  })

  it('handles handleConfirmation with missing contact', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
      current_state: 'confirming_order',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'confirm:pay',
      replyTitle: 'Confirm & Pay',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Please provide your contact details first.')
  })

  it('handles handleConfirmation with empty cart', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'confirm:pay',
      replyTitle: 'Confirm & Pay',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Your cart is empty. Type *Menu* to start over.')
  })

  it('handles checkout API network error', async () => {
    const { getCart } = await import('@/lib/bots/conversation')
    vi.mocked(getCart).mockResolvedValueOnce([
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
    ])

    const { getOrCreateSession } = await import('@/lib/bots/conversation')
    vi.mocked(getOrCreateSession).mockResolvedValueOnce({
      id: 'sess-1',
      platform: 'whatsapp',
      platform_user_id: '60123456789',
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

    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { sendWhatsAppTextMessage } = await import('@/lib/bots/whatsapp')

    const req = createRequest(createPayload({
      messageType: 'interactive',
      interactiveType: 'button_reply',
      replyId: 'confirm:pay',
      replyTitle: 'Confirm & Pay',
    }))
    const response = await POST(req as never)
    expect(response.status).toBe(200)
    expect(sendWhatsAppTextMessage).toHaveBeenCalledWith('60123456789', 'Sorry, something went wrong with checkout. Please try again later.')
  })
})
