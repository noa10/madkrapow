import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getOrCreateSession,
  updateState,
  addToCart,
  removeFromCart,
  getCart,
  clearSession,
  type BotSession,
  type CartItem,
  type ConversationState,
} from '../conversation'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

function buildMockSupabaseClient(chainOverrides?: Record<string, unknown>) {
  const defaultResponse = { data: null, error: null }

  const maybeSingle = vi.fn().mockResolvedValue(defaultResponse)
  const single = vi.fn().mockResolvedValue(defaultResponse)

  const eqReturn: Record<string, unknown> = { maybeSingle, single }
  const eq = vi.fn().mockReturnValue(eqReturn)
  eqReturn.eq = eq

  const select = vi.fn().mockReturnValue({ eq, maybeSingle, single })
  const updateEq = vi.fn().mockReturnValue({ select, single })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const insert = vi.fn().mockReturnValue({ select, single })
  const from = vi.fn().mockReturnValue({ select, insert, update, eq })

  if (chainOverrides) {
    for (const [key, value] of Object.entries(chainOverrides)) {
      if (key === 'maybeSingle') maybeSingle.mockResolvedValue(value)
      if (key === 'single') single.mockResolvedValue(value)
    }
  }

  return { from, select, insert, update, eq, single, maybeSingle, updateEq }
}

let mockSupabase = buildMockSupabaseClient()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}))

function makeSession(overrides?: Partial<BotSession>): BotSession {
  return {
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
    ...overrides,
  }
}

describe('getOrCreateSession', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('returns existing non-expired session and updates last_interaction_at', async () => {
    const session = makeSession()

    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: session, error: null },
    })

    const result = await getOrCreateSession('telegram', '12345')
    expect(result.id).toBe('sess-1')
    expect(result.platform).toBe('telegram')
  })

  it('clears expired session and returns new one', async () => {
    const expiredSession = makeSession({
      last_interaction_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    })
    const clearedSession = makeSession({
      id: 'sess-1',
      current_state: 'idle',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: null,
      selected_modifier_group_index: null,
    })

    const maybeSingleFn = vi.fn()
    maybeSingleFn.mockResolvedValueOnce({ data: expiredSession, error: null })

    const singleFn = vi.fn().mockResolvedValue({ data: clearedSession, error: null })
    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    const eq2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle: maybeSingleFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: eq1 }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: maybeSingleFn,
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await getOrCreateSession('telegram', '12345')
    expect(result.current_state).toBe('idle')
    expect(result.cart_json).toEqual([])
  })

  it('creates new session when none exists', async () => {
    const created = makeSession({ id: 'sess-new', platform: 'whatsapp' })

    const maybeSingleFn = vi.fn().mockResolvedValueOnce({ data: null, error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: created, error: null })
    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })

    const eq2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle: maybeSingleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eq1 })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: selectFn,
        insert: insertFn,
        update: vi.fn(),
        eq: vi.fn(),
      }),
      select: selectFn,
      insert: insertFn,
      update: vi.fn(),
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: maybeSingleFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await getOrCreateSession('whatsapp', '60123456789')
    expect(result.id).toBe('sess-new')
    expect(result.platform).toBe('whatsapp')
  })

  it('handles race condition on insert (23505)', async () => {
    const raced = makeSession({ id: 'sess-race' })

    const maybeSingleFn = vi.fn()
    maybeSingleFn.mockResolvedValueOnce({ data: null, error: null })
    maybeSingleFn.mockResolvedValueOnce({ data: raced, error: null })

    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })
    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })

    const eq2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle: maybeSingleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eq1 })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: selectFn,
        insert: insertFn,
        update: vi.fn(),
        eq: vi.fn(),
      }),
      select: selectFn,
      insert: insertFn,
      update: vi.fn(),
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: maybeSingleFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await getOrCreateSession('telegram', '12345')
    expect(result.id).toBe('sess-race')
  })

  it('throws when find fails', async () => {
    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: null, error: { message: 'find error' } },
    })

    await expect(getOrCreateSession('telegram', '12345')).rejects.toThrow('Failed to find bot session')
  })

  it('throws when insert fails with non-23505 error', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValueOnce({ data: null, error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '99999', message: 'insert failed' } })
    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })

    const eq2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle: maybeSingleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eq1 })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: selectFn,
        insert: insertFn,
        update: vi.fn(),
        eq: vi.fn(),
      }),
      select: selectFn,
      insert: insertFn,
      update: vi.fn(),
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: maybeSingleFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    await expect(getOrCreateSession('telegram', '12345')).rejects.toThrow('Failed to create bot session')
  })

  it('throws when insert returns no data', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValueOnce({ data: null, error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })

    const eq2 = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2, maybeSingle: maybeSingleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eq1 })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: selectFn,
        insert: insertFn,
        update: vi.fn(),
        eq: vi.fn(),
      }),
      select: selectFn,
      insert: insertFn,
      update: vi.fn(),
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: maybeSingleFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    await expect(getOrCreateSession('telegram', '12345')).rejects.toThrow('Bot session insert returned no data')
  })
})

describe('updateState', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('updates state with valid transition', async () => {
    const current = { current_state: 'idle' as ConversationState }
    const updated = makeSession({ current_state: 'browsing_menu' })

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: current, error: null })
    singleFn.mockResolvedValueOnce({ data: updated, error: null })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await updateState('sess-1', 'browsing_menu')
    expect(result.current_state).toBe('browsing_menu')
  })

  it('throws for invalid state transition', async () => {
    const current = { current_state: 'idle' as ConversationState }

    mockSupabase = buildMockSupabaseClient({
      single: { data: current, error: null },
    })

    await expect(updateState('sess-1', 'complete')).rejects.toThrow('Invalid state transition')
  })

  it('throws when session not found', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: null, error: { message: 'not found' } },
    })

    await expect(updateState('sess-1', 'browsing_menu')).rejects.toThrow('Session not found')
  })

  it('throws when update fails', async () => {
    const current = { current_state: 'idle' as ConversationState }

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: current, error: null })
    singleFn.mockResolvedValueOnce({ data: null, error: { message: 'update failed' } })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    await expect(updateState('sess-1', 'browsing_menu')).rejects.toThrow('Failed to update session state')
  })

  it('updates with session data (address, contact, selectedItemId, etc)', async () => {
    const current = { current_state: 'entering_address' as ConversationState }
    const updated = makeSession({
      current_state: 'entering_contact',
      address_json: { address_line1: '123 Main St' },
      selected_item_id: 'item-1',
      selected_modifier_group_index: 0,
      language: 'ms',
    })

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: current, error: null })
    singleFn.mockResolvedValueOnce({ data: updated, error: null })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await updateState('sess-1', 'entering_contact', {
      address: { address_line1: '123 Main St' },
      selectedItemId: 'item-1',
      selectedModifierGroupIndex: 0,
      language: 'ms',
    })
    expect(result.current_state).toBe('entering_contact')
    expect(result.address_json).toEqual({ address_line1: '123 Main St' })
    expect(result.selected_item_id).toBe('item-1')
    expect(result.selected_modifier_group_index).toBe(0)
    expect(result.language).toBe('ms')
  })
})

describe('addToCart', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('adds item to empty cart', async () => {
    const session = { cart_json: [] }
    const updated = makeSession({
      cart_json: [
        {
          menuItemId: 'item-1',
          name: 'Nasi Goreng',
          priceCents: 1200,
          quantity: 1,
          modifiers: [],
        },
      ],
    })

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: session, error: null })
    singleFn.mockResolvedValueOnce({ data: updated, error: null })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const item: CartItem = {
      menuItemId: 'item-1',
      name: 'Nasi Goreng',
      priceCents: 1200,
      quantity: 1,
      modifiers: [],
    }

    const result = await addToCart('sess-1', item)
    expect(result.cart_json).toHaveLength(1)
    expect(result.cart_json[0].name).toBe('Nasi Goreng')
  })

  it('adds item to existing cart', async () => {
    const session = {
      cart_json: [
        {
          menuItemId: 'item-1',
          name: 'Nasi Goreng',
          priceCents: 1200,
          quantity: 1,
          modifiers: [],
        },
      ],
    }
    const updated = makeSession({
      cart_json: [
        ...session.cart_json,
        {
          menuItemId: 'item-2',
          name: 'Mee Goreng',
          priceCents: 1000,
          quantity: 1,
          modifiers: [],
        },
      ],
    })

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: session, error: null })
    singleFn.mockResolvedValueOnce({ data: updated, error: null })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const item: CartItem = {
      menuItemId: 'item-2',
      name: 'Mee Goreng',
      priceCents: 1000,
      quantity: 1,
      modifiers: [],
    }

    const result = await addToCart('sess-1', item)
    expect(result.cart_json).toHaveLength(2)
  })

  it('throws when session not found', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: null, error: { message: 'not found' } },
    })

    const item: CartItem = {
      menuItemId: 'item-1',
      name: 'Nasi Goreng',
      priceCents: 1200,
      quantity: 1,
      modifiers: [],
    }

    await expect(addToCart('sess-1', item)).rejects.toThrow('Session not found')
  })

  it('throws when update fails', async () => {
    const session = { cart_json: [] }

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: session, error: null })
    singleFn.mockResolvedValueOnce({ data: null, error: { message: 'update failed' } })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const item: CartItem = {
      menuItemId: 'item-1',
      name: 'Nasi Goreng',
      priceCents: 1200,
      quantity: 1,
      modifiers: [],
    }

    await expect(addToCart('sess-1', item)).rejects.toThrow('Failed to add item to cart')
  })
})

describe('removeFromCart', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('removes item at valid index', async () => {
    const session = {
      cart_json: [
        { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] },
        { menuItemId: 'item-2', name: 'Mee Goreng', priceCents: 1000, quantity: 1, modifiers: [] },
      ],
    }
    const updated = makeSession({
      cart_json: [
        { menuItemId: 'item-2', name: 'Mee Goreng', priceCents: 1000, quantity: 1, modifiers: [] },
      ],
    })

    const singleFn = vi.fn()
    singleFn.mockResolvedValueOnce({ data: session, error: null })
    singleFn.mockResolvedValueOnce({ data: updated, error: null })

    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: singleFn }) }),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await removeFromCart('sess-1', 0)
    expect(result.cart_json).toHaveLength(1)
    expect(result.cart_json[0].menuItemId).toBe('item-2')
  })

  it('throws for invalid index', async () => {
    const session = {
      cart_json: [{ menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 1, modifiers: [] }],
    }

    mockSupabase = buildMockSupabaseClient({
      single: { data: session, error: null },
    })

    await expect(removeFromCart('sess-1', 5)).rejects.toThrow('Invalid cart item index')
    await expect(removeFromCart('sess-1', -1)).rejects.toThrow('Invalid cart item index')
  })

  it('throws when session not found', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: null, error: { message: 'not found' } },
    })

    await expect(removeFromCart('sess-1', 0)).rejects.toThrow('Session not found')
  })
})

describe('getCart', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('returns cart items', async () => {
    const cart: CartItem[] = [
      { menuItemId: 'item-1', name: 'Nasi Goreng', priceCents: 1200, quantity: 2, modifiers: [] },
    ]

    mockSupabase = buildMockSupabaseClient({
      single: { data: { cart_json: cart }, error: null },
    })

    const result = await getCart('sess-1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Nasi Goreng')
  })

  it('returns empty array when cart is null', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: { cart_json: null }, error: null },
    })

    const result = await getCart('sess-1')
    expect(result).toEqual([])
  })

  it('throws when session not found', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: null, error: { message: 'not found' } },
    })

    await expect(getCart('sess-1')).rejects.toThrow('Session not found')
  })
})

describe('clearSession', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('clears all session data', async () => {
    const cleared = makeSession({
      current_state: 'idle',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: null,
      selected_modifier_group_index: null,
    })

    const singleFn = vi.fn().mockResolvedValue({ data: cleared, error: null })
    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn(),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await clearSession('sess-1')
    expect(result.current_state).toBe('idle')
    expect(result.cart_json).toEqual([])
    expect(result.address_json).toBeNull()
    expect(result.contact_json).toBeNull()
    expect(result.selected_item_id).toBeNull()
    expect(result.selected_modifier_group_index).toBeNull()
  })

  it('throws when update fails', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'update failed' } })
    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn(),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    await expect(clearSession('sess-1')).rejects.toThrow('Failed to clear session')
  })

  it('throws when session not found during clear', async () => {
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateEqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn(),
        insert: vi.fn(),
        update: updateFn,
        eq: vi.fn(),
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: vi.fn(),
      single: singleFn,
      maybeSingle: vi.fn(),
      updateEq: updateEqFn,
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    await expect(clearSession('sess-1')).rejects.toThrow('Session not found during clear')
  })
})
