import { describe, it, expect, vi } from 'vitest'
import {
  getBotMenu,
  getBotItemWithModifiers,
  formatBotMenuText,
  formatBotItemDetails,
  isItemAvailable,
  type BotMenuCategory,
  type BotItemWithAllModifiers,
} from '../menu'

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
    }

    const order = vi.fn().mockReturnValue(makeThenable(terminal))
    const inFn = vi.fn().mockReturnValue(makeThenable({ order }))

    const eqReturn = makeThenable({
      order,
      single: terminal.single,
      maybeSingle: terminal.maybeSingle,
    })
    const eq = vi.fn().mockReturnValue(eqReturn)

    const selectReturn = makeThenable({
      eq,
      in: inFn,
      order,
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
    }
  })

  return { from }
}

describe('getBotMenu', () => {
  it('returns categories with items', async () => {
    const categories = [
      { id: 'cat-1', name: 'Mains', sort_order: 1, is_active: true },
      { id: 'cat-2', name: 'Drinks', sort_order: 2, is_active: true },
    ]
    const menuItems = [
      { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, description: 'Fried rice', is_available: true, category_id: 'cat-1', sort_order: 1 },
      { id: 'item-2', name: 'Teh Tarik', price_cents: 400, description: null, is_available: true, category_id: 'cat-2', sort_order: 1 },
    ]
    const modifierGroups = [
      { menu_item_id: 'item-1', modifier_group_id: 'mg-1' },
    ]

    const mockSupabase = buildMockSupabaseClient({
      categories: { data: categories, error: null },
      menu_items: { data: menuItems, error: null },
      menu_item_modifier_groups: { data: modifierGroups, error: null },
    })

    const result = await getBotMenu(mockSupabase as never)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Mains')
    expect(result[0].items).toHaveLength(1)
    expect(result[0].items[0].has_modifiers).toBe(true)
    expect(result[1].items[0].has_modifiers).toBe(false)
  })

  it('returns empty array when no categories', async () => {
    const mockSupabase = buildMockSupabaseClient({
      categories: { data: [], error: null },
      menu_items: { data: [], error: null },
      menu_item_modifier_groups: { data: [], error: null },
    })

    const result = await getBotMenu(mockSupabase as never)
    expect(result).toEqual([])
  })

  it('throws when categories query fails', async () => {
    const mockSupabase = buildMockSupabaseClient({
      categories: { data: null, error: { message: 'db error' } },
    })

    await expect(getBotMenu(mockSupabase as never)).rejects.toThrow('db error')
  })

  it('throws when menu items query fails', async () => {
    const mockSupabase = buildMockSupabaseClient({
      categories: { data: [], error: null },
      menu_items: { data: null, error: { message: 'items error' } },
    })

    await expect(getBotMenu(mockSupabase as never)).rejects.toThrow('items error')
  })
})

describe('getBotItemWithModifiers', () => {
  it('returns item with all modifiers', async () => {
    const menuItem = {
      id: 'item-1',
      name: 'Nasi Goreng',
      price_cents: 1200,
      description: 'Fried rice',
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
    }
    const category = { id: 'cat-1', name: 'Mains' }
    const mig = [
      { menu_item_id: 'item-1', modifier_group_id: 'mg-1', is_required: true },
    ]
    const modifierGroups = [
      { id: 'mg-1', name: 'Spice Level', min_selections: 1, max_selections: 1, sort_order: 1 },
    ]
    const modifiers = [
      { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: true, modifier_group_id: 'mg-1', sort_order: 1 },
      { id: 'mod-2', name: 'Spicy', price_delta_cents: 100, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 2 },
    ]

    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: menuItem, error: null },
      categories: { data: category, error: null },
      menu_item_modifier_groups: { data: mig, error: null },
      modifier_groups: { data: modifierGroups, error: null },
      modifiers: { data: modifiers, error: null },
    })

    const result = await getBotItemWithModifiers(mockSupabase as never, 'item-1')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Nasi Goreng')
    expect(result?.modifier_groups).toHaveLength(1)
    expect(result?.modifier_groups[0].modifiers).toHaveLength(2)
    expect(result?.modifier_groups[0].is_required).toBe(true)
  })

  it('returns item without modifiers when none attached', async () => {
    const menuItem = {
      id: 'item-2',
      name: 'Teh Tarik',
      price_cents: 400,
      description: null,
      is_available: true,
      category_id: 'cat-2',
      sort_order: 1,
    }
    const category = { id: 'cat-2', name: 'Drinks' }

    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: menuItem, error: null },
      categories: { data: category, error: null },
      menu_item_modifier_groups: { data: [], error: null },
    })

    const result = await getBotItemWithModifiers(mockSupabase as never, 'item-2')
    expect(result).not.toBeNull()
    expect(result?.modifier_groups).toHaveLength(0)
  })

  it('returns null when item not found', async () => {
    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: null, error: { message: 'not found' } },
    })

    const result = await getBotItemWithModifiers(mockSupabase as never, 'missing')
    expect(result).toBeNull()
  })

  it('returns null when category query fails', async () => {
    const menuItem = {
      id: 'item-1',
      name: 'Nasi Goreng',
      price_cents: 1200,
      description: 'Fried rice',
      is_available: true,
      category_id: 'cat-1',
      sort_order: 1,
    }

    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: menuItem, error: null },
      categories: { data: null, error: { message: 'cat error' } },
    })

    const result = await getBotItemWithModifiers(mockSupabase as never, 'item-1')
    expect(result).toBeNull()
  })
})

describe('formatBotMenuText', () => {
  it('formats menu with categories and items', () => {
    const menu: BotMenuCategory[] = [
      {
        id: 'cat-1',
        name: 'Mains',
        items: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, description: 'Fried rice', is_available: true, has_modifiers: true },
          { id: 'item-2', name: 'Mee Goreng', price_cents: 1000, description: null, is_available: true, has_modifiers: false },
        ],
      },
      {
        id: 'cat-2',
        name: 'Drinks',
        items: [
          { id: 'item-3', name: 'Teh Tarik', price_cents: 400, description: null, is_available: true, has_modifiers: false },
        ],
      },
    ]

    const text = formatBotMenuText(menu)
    expect(text).toContain('*Menu*')
    expect(text).toContain('*Mains*')
    expect(text).toContain('Nasi Goreng')
    expect(text).toContain('RM 12.00')
    expect(text).toContain('[+opts]')
    expect(text).toContain('Mee Goreng')
    expect(text).toContain('*Drinks*')
    expect(text).toContain('Teh Tarik')
  })

  it('returns empty message for empty menu', () => {
    const text = formatBotMenuText([])
    expect(text).toBe('Our menu is currently empty. Please check back later!')
  })

  it('skips empty categories', () => {
    const menu: BotMenuCategory[] = [
      {
        id: 'cat-1',
        name: 'Mains',
        items: [
          { id: 'item-1', name: 'Nasi Goreng', price_cents: 1200, description: null, is_available: true, has_modifiers: false },
        ],
      },
      {
        id: 'cat-2',
        name: 'Empty Cat',
        items: [],
      },
    ]

    const text = formatBotMenuText(menu)
    expect(text).toContain('Mains')
    expect(text).not.toContain('Empty Cat')
  })
})

describe('formatBotItemDetails', () => {
  it('formats item with modifiers', () => {
    const item: BotItemWithAllModifiers = {
      id: 'item-1',
      name: 'Nasi Goreng',
      price_cents: 1200,
      description: 'Fried rice',
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
          name: 'Spice Level',
          description: null,
          min_selections: 1,
          max_selections: 1,
          sort_order: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          is_required: true,
          modifiers: [
            { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, is_default: true, modifier_group_id: 'mg-1', sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
            { id: 'mod-2', name: 'Spicy', price_delta_cents: 100, is_available: true, is_default: false, modifier_group_id: 'mg-1', sort_order: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
          ],
        },
      ],
    }

    const text = formatBotItemDetails(item)
    expect(text).toContain('*Nasi Goreng*')
    expect(text).toContain('RM 12.00')
    expect(text).toContain('Fried rice')
    expect(text).toContain('*Spice Level*')
    expect(text).toContain('(Required)')
    expect(text).toContain('Mild')
    expect(text).toContain('Spicy')
    expect(text).toContain('(+RM 1.00)')
    expect(text).toContain('[default]')
  })

  it('marks unavailable items', () => {
    const item: BotItemWithAllModifiers = {
      id: 'item-1',
      name: 'Nasi Goreng',
      price_cents: 1200,
      description: null,
      is_available: false,
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
      modifier_groups: [],
    }

    const text = formatBotItemDetails(item)
    expect(text).toContain('*Currently unavailable*')
  })

  it('formats item without modifiers', () => {
    const item: BotItemWithAllModifiers = {
      id: 'item-1',
      name: 'Teh Tarik',
      price_cents: 400,
      description: null,
      is_available: true,
      category_id: 'cat-2',
      sort_order: 1,
      image_url: null,
      slug: 'test-slug',
      spice_level: 1,
      ingredients: ['rice', 'egg'],
      is_signature: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      category: { id: 'cat-2', name: 'Drinks' },
      modifier_groups: [],
    }

    const text = formatBotItemDetails(item)
    expect(text).toContain('*Teh Tarik*')
    expect(text).not.toContain('*Options:*')
  })
})

describe('isItemAvailable', () => {
  it('returns available when item and modifiers are available', async () => {
    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: { is_available: true }, error: null },
      menu_item_modifier_groups: { data: [{ modifier_group_id: 'mg-1' }], error: null },
      modifiers: { data: [{ id: 'mod-1', is_available: true }], error: null },
    })

    const result = await isItemAvailable(mockSupabase as never, 'item-1')
    expect(result.available).toBe(true)
    expect(result.itemAvailable).toBe(true)
    expect(result.allModifiersAvailable).toBe(true)
    expect(result.unavailableModifierIds).toEqual([])
  })

  it('returns unavailable when item is not available', async () => {
    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: { is_available: false }, error: null },
    })

    const result = await isItemAvailable(mockSupabase as never, 'item-1')
    expect(result.available).toBe(false)
    expect(result.itemAvailable).toBe(false)
  })

  it('returns unavailable when some modifiers are unavailable', async () => {
    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: { is_available: true }, error: null },
      menu_item_modifier_groups: { data: [{ modifier_group_id: 'mg-1' }], error: null },
      modifiers: { data: [{ id: 'mod-1', is_available: false }, { id: 'mod-2', is_available: true }], error: null },
    })

    const result = await isItemAvailable(mockSupabase as never, 'item-1')
    expect(result.available).toBe(false)
    expect(result.itemAvailable).toBe(true)
    expect(result.allModifiersAvailable).toBe(false)
    expect(result.unavailableModifierIds).toEqual(['mod-1'])
  })

  it('returns available when no modifiers attached', async () => {
    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: { is_available: true }, error: null },
      menu_item_modifier_groups: { data: [], error: null },
    })

    const result = await isItemAvailable(mockSupabase as never, 'item-1')
    expect(result.available).toBe(true)
    expect(result.allModifiersAvailable).toBe(true)
  })

  it('returns unavailable when item not found', async () => {
    const mockSupabase = buildMockSupabaseClient({
      menu_items: { data: null, error: { message: 'not found' } },
    })

    const result = await isItemAvailable(mockSupabase as never, 'missing')
    expect(result.available).toBe(false)
    expect(result.itemAvailable).toBe(false)
  })
})
