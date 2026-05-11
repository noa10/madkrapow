import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  findOrCreateBotCustomer,
  updateBotCustomerContact,
  getCustomerForOrder,
  type BotCustomer,
} from '../customer'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

function buildMockSupabaseClient(chainOverrides?: Record<string, unknown>) {
  const defaultResponse = { data: null, error: null }

  const maybeSingle = vi.fn().mockResolvedValue(defaultResponse)
  const single = vi.fn().mockResolvedValue(defaultResponse)
  const eq = vi.fn().mockReturnValue({ maybeSingle, single })
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

describe('findOrCreateBotCustomer', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('returns existing customer for telegram', async () => {
    const existing: BotCustomer = {
      id: 'cust-1',
      auth_user_id: null,
      telegram_id: '12345',
      whatsapp_id: null,
      name: 'John',
      phone: '+60123456789',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: existing, error: null },
    })

    const result = await findOrCreateBotCustomer('telegram', '12345', { name: 'John' })
    expect(result).toEqual(existing)
    expect(mockSupabase.from).toHaveBeenCalledWith('customers')
  })

  it('returns existing customer for whatsapp', async () => {
    const existing: BotCustomer = {
      id: 'cust-2',
      auth_user_id: null,
      telegram_id: null,
      whatsapp_id: '60123456789',
      name: 'Jane',
      phone: '+60123456789',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: existing, error: null },
    })

    const result = await findOrCreateBotCustomer('whatsapp', '60123456789', { name: 'Jane' })
    expect(result).toEqual(existing)
  })

  it('creates new customer when not found', async () => {
    const created: BotCustomer = {
      id: 'cust-new',
      auth_user_id: null,
      telegram_id: '99999',
      whatsapp_id: null,
      name: 'New User',
      phone: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const maybeSingleFn = vi.fn()
    maybeSingleFn.mockResolvedValueOnce({ data: null, error: null })

    const singleFn = vi.fn().mockResolvedValue({ data: created, error: null })

    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const selectFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn }) })

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

    const result = await findOrCreateBotCustomer('telegram', '99999', { name: 'New User' })
    expect(result).toEqual(created)
  })

  it('handles race condition on unique violation (23505)', async () => {
    const raced: BotCustomer = {
      id: 'cust-race',
      auth_user_id: null,
      telegram_id: '11111',
      whatsapp_id: null,
      name: 'Racer',
      phone: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    const maybeSingleFn = vi.fn()
    maybeSingleFn.mockResolvedValueOnce({ data: null, error: null })
    maybeSingleFn.mockResolvedValueOnce({ data: raced, error: null })

    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })

    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const selectFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn }) })

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

    const result = await findOrCreateBotCustomer('telegram', '11111', { name: 'Racer' })
    expect(result).toEqual(raced)
  })

  it('throws when find fails', async () => {
    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: null, error: { message: 'DB error' } },
    })

    await expect(findOrCreateBotCustomer('telegram', '123', {})).rejects.toThrow('Failed to look up bot customer')
  })

  it('throws when insert fails with non-23505 error', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValueOnce({ data: null, error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '99999', message: 'insert failed' } })

    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const selectFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn }) })

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

    await expect(findOrCreateBotCustomer('telegram', '123', {})).rejects.toThrow('Failed to create bot customer')
  })

  it('throws when insert returns no data', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValueOnce({ data: null, error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: null })

    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const selectFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn }) })

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

    await expect(findOrCreateBotCustomer('telegram', '123', {})).rejects.toThrow('Bot customer insert returned no data')
  })

  it('throws when race resolution find fails', async () => {
    const maybeSingleFn = vi.fn()
    maybeSingleFn.mockResolvedValueOnce({ data: null, error: null })
    maybeSingleFn.mockResolvedValueOnce({ data: null, error: { message: 'race find failed' } })

    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })

    const insertFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const selectFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn }) })

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

    await expect(findOrCreateBotCustomer('telegram', '123', {})).rejects.toThrow('Race-resolution find failed')
  })
})

describe('updateBotCustomerContact', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('updates name and phone', async () => {
    const updated: BotCustomer = {
      id: 'cust-1',
      auth_user_id: null,
      telegram_id: '12345',
      whatsapp_id: null,
      name: 'Updated Name',
      phone: '+60111111111',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }

    const singleFn = vi.fn().mockResolvedValue({ data: updated, error: null })
    const eqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn(),
        insert: vi.fn(),
        update: updateFn,
        eq: eqFn,
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: eqFn,
      single: singleFn,
      maybeSingle: vi.fn(),
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await updateBotCustomerContact('cust-1', { name: 'Updated Name', phone: '+60111111111' })
    expect(result).toEqual(updated)
    expect(updateFn).toHaveBeenCalledWith({ name: 'Updated Name', phone: '+60111111111' })
  })

  it('updates only name when phone not provided', async () => {
    const updated: BotCustomer = {
      id: 'cust-1',
      auth_user_id: null,
      telegram_id: '12345',
      whatsapp_id: null,
      name: 'Only Name',
      phone: '+60123456789',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    }

    const singleFn = vi.fn().mockResolvedValue({ data: updated, error: null })
    const eqFn = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleFn }) })
    const updateFn = vi.fn().mockReturnValue({ eq: eqFn })

    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn(),
        insert: vi.fn(),
        update: updateFn,
        eq: eqFn,
      }),
      select: vi.fn(),
      insert: vi.fn(),
      update: updateFn,
      eq: eqFn,
      single: singleFn,
      maybeSingle: vi.fn(),
    } as unknown as ReturnType<typeof buildMockSupabaseClient>

    const result = await updateBotCustomerContact('cust-1', { name: 'Only Name' })
    expect(result).toEqual(updated)
    expect(updateFn).toHaveBeenCalledWith({ name: 'Only Name' })
  })

  it('throws when update fails', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: null, error: { message: 'update error' } },
    })

    await expect(updateBotCustomerContact('cust-1', { name: 'Test' })).rejects.toThrow(
      'Failed to update bot customer contact'
    )
  })

  it('throws when customer not found', async () => {
    mockSupabase = buildMockSupabaseClient({
      single: { data: null, error: null },
    })

    await expect(updateBotCustomerContact('cust-1', { name: 'Test' })).rejects.toThrow('Bot customer not found')
  })
})

describe('getCustomerForOrder', () => {
  beforeEach(() => {
    mockSupabase = buildMockSupabaseClient()
  })

  it('returns customer with order info', async () => {
    const customerData = {
      id: 'cust-1',
      auth_user_id: null,
      telegram_id: '12345',
      whatsapp_id: null,
      name: 'John',
      phone: '+60123456789',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSupabase = buildMockSupabaseClient({
      maybeSingle: {
        data: {
          id: 'order-1',
          status: 'paid',
          customer: customerData,
        },
        error: null,
      },
    })

    const result = await getCustomerForOrder('order-1')
    expect(result).not.toBeNull()
    expect(result?.id).toBe('cust-1')
    expect(result?.order_id).toBe('order-1')
    expect(result?.order_status).toBe('paid')
  })

  it('handles array-wrapped customer from Supabase', async () => {
    const customerData = {
      id: 'cust-1',
      auth_user_id: null,
      telegram_id: '12345',
      whatsapp_id: null,
      name: 'John',
      phone: '+60123456789',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    mockSupabase = buildMockSupabaseClient({
      maybeSingle: {
        data: {
          id: 'order-1',
          status: 'pending',
          customer: [customerData],
        },
        error: null,
      },
    })

    const result = await getCustomerForOrder('order-1')
    expect(result?.id).toBe('cust-1')
  })

  it('returns null when order not found', async () => {
    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: null, error: null },
    })

    const result = await getCustomerForOrder('order-missing')
    expect(result).toBeNull()
  })

  it('returns null when customer is null', async () => {
    mockSupabase = buildMockSupabaseClient({
      maybeSingle: {
        data: { id: 'order-1', status: 'paid', customer: null },
        error: null,
      },
    })

    const result = await getCustomerForOrder('order-1')
    expect(result).toBeNull()
  })

  it('throws when query fails', async () => {
    mockSupabase = buildMockSupabaseClient({
      maybeSingle: { data: null, error: { message: 'db error' } },
    })

    await expect(getCustomerForOrder('order-1')).rejects.toThrow('Failed to fetch customer for order')
  })
})
