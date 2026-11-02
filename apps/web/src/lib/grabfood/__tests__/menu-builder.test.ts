import { describe, expect, it } from 'vitest'
import { ALL_DAY_SELLING_TIME_ID, buildGrabMenu, type MenuCategoryRow } from '../menu-builder'

const ROWS: MenuCategoryRow[] = [
  {
    id: 'cat-1',
    name: 'Rice Bowls',
    sort_order: 1,
    is_active: true,
    channel_categories: [{ channel: 'grabfood', external_category_id: 'GRAB-CAT-1' }],
    menu_items: [
      {
        id: 'item-1',
        name: 'Set Krapow Daging',
        description: 'Basil beef rice bowl',
        price_cents: 1300,
        image_url: 'https://cdn.example/item-1.png',
        is_available: true,
        snooze_till: null,
        sort_order: 1,
        channel_products: [
          {
            channel: 'grabfood',
            external_item_id: 'GRAB-ITEM-1',
            external_name: 'Set Krapow Daging (Grab)',
            price_cents: 1500,
            is_available: true,
            snooze_till: null,
          },
        ],
        menu_item_modifier_groups: [
          {
            modifier_groups: {
              id: 'group-1',
              name: 'Spice level',
              min_selections: 1,
              max_selections: 1,
              sort_order: 1,
              modifiers: [
                { id: 'mod-1', name: 'Mild', price_delta_cents: 0, is_available: true, sort_order: 1 },
                { id: 'mod-2', name: 'Extra spicy', price_delta_cents: 100, is_available: true, sort_order: 2 },
              ],
            },
          },
        ],
      },
      {
        id: 'item-2',
        name: 'Unmapped item',
        description: null,
        price_cents: 900,
        image_url: null,
        is_available: true,
        snooze_till: null,
        sort_order: 2,
        channel_products: [],
        menu_item_modifier_groups: [],
      },
    ],
  },
  {
    id: 'cat-2',
    name: 'Unmapped category',
    sort_order: 2,
    is_active: true,
    channel_categories: [],
    menu_items: [],
  },
]

describe('buildGrabMenu', () => {
  it('emits only mapped categories and items, with stable ids and prices', () => {
    const menu = buildGrabMenu(ROWS, { merchantId: '1-TEST', partnerMerchantId: 'Partner-1' })
    expect(menu.merchantID).toBe('1-TEST')
    expect(menu.partnerMerchantID).toBe('Partner-1')
    expect(menu.currency).toEqual({ code: 'MYR', symbol: 'RM', exponent: 2 })
    expect(menu.categories).toHaveLength(1)
    expect(menu.categories[0].id).toBe('GRAB-CAT-1')
    expect(menu.categories[0].sellingTimeID).toBe(ALL_DAY_SELLING_TIME_ID)
    expect(menu.categories[0].items).toHaveLength(1)
    expect(menu.categories[0].items[0]).toMatchObject({
      id: 'GRAB-ITEM-1',
      name: 'Set Krapow Daging (Grab)',
      price: 1500,
      availableStatus: 'AVAILABLE',
      taxable: true,
      photos: ['https://cdn.example/item-1.png'],
    })
  })

  it('uses a stable local category id when no Grab category mapping exists', () => {
    const rows = structuredClone(ROWS)
    rows[0].channel_categories = []
    expect(buildGrabMenu(rows).categories[0].id).toBe(rows[0].id)
  })

  it('maps modifiers with local UUIDs and price deltas', () => {
    const menu = buildGrabMenu(ROWS)
    const groups = menu.categories[0].items[0].modifierGroups
    expect(groups).toHaveLength(1)
    expect(groups?.[0]).toMatchObject({
      id: 'group-1',
      selectionRangeMin: 1,
      selectionRangeMax: 1,
    })
    expect(groups?.[0].modifiers?.map((m) => [m.id, m.price])).toEqual([
      ['mod-1', 0],
      ['mod-2', 100],
    ])
    expect(menu.merchantID).toBeUndefined()
  })

  it('carries UNAVAILABLE + maxStock 0 for snoozed items', () => {
    const rows = structuredClone(ROWS)
    const item = rows[0].menu_items![0]
    const mappings = item.channel_products as Array<{ snooze_till: string | null }>
    mappings[0].snooze_till = '2030-01-01T00:00:00Z'
    const menu = buildGrabMenu(rows)
    expect(menu.categories[0].items[0]).toMatchObject({
      availableStatus: 'UNAVAILABLE',
      maxStock: 0,
    })
    expect(menu.categories[0].availableStatus).toBe('UNAVAILABLE')
  })
})
