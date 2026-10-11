import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapHubboMenuToLocal, pullHubboMenu, HUBBO_MERCHANT_SOURCE } from '../menu'
import type { HubboMerchantMenu } from '../types'

const NOW = new Date('2026-10-11T02:00:00Z').getTime()
const FUTURE_SNOOZE = Math.floor((NOW + 60 * 60 * 1000) / 1000) // epoch seconds

describe('mapHubboMenuToLocal', () => {
  it('maps flat categories + items with grabfood price overrides', () => {
    const menu: HubboMerchantMenu = {
      categories: [
        { id: 'cat-1', name: 'Rice Dishes' },
        { id: 'cat-2', name: 'Drinks' },
      ],
      items: [
        {
          id: 'item-1',
          name: 'Nasi Lemak',
          desc: 'Fragrant rice',
          price: 1250,
          grabfoodPrice: 1300,
          sku: 'GF-NL-1',
          categoryId: 'cat-1',
        },
        {
          id: 'item-2',
          name: 'Teh Ais',
          priceInTwoDecimal: '3.50',
          categoryId: 'cat-2',
        },
      ],
    }

    const plan = mapHubboMenuToLocal(menu, NOW)

    expect(plan.categories).toEqual([
      { externalId: 'cat-1', name: 'Rice Dishes', sortOrder: 0 },
      { externalId: 'cat-2', name: 'Drinks', sortOrder: 1 },
    ])
    expect(plan.items[0]).toMatchObject({
      externalId: 'item-1',
      sku: 'GF-NL-1',
      priceCents: 1250,
      grabfoodPriceCents: 1300,
      isAvailable: true,
    })
    expect(plan.items[1]).toMatchObject({ priceCents: 350, grabfoodPriceCents: null })
    expect(plan.warnings).toEqual([])
  })

  it('accepts items nested under categories when there is no flat list', () => {
    const menu: HubboMerchantMenu = {
      categories: [{ id: 'cat-1', name: 'Rice', items: [{ id: 'item-1', name: 'X', price: 900 }] }],
    }

    const plan = mapHubboMenuToLocal(menu, NOW)

    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ externalId: 'item-1', externalCategoryId: null })
  })

  it('treats a future snoozeTill (epoch seconds) as unavailable', () => {
    const menu: HubboMerchantMenu = {
      categories: [{ id: 'cat-1', name: 'Rice' }],
      items: [
        { id: 'item-1', name: 'Snoozed', price: 900, snoozeTill: FUTURE_SNOOZE, categoryId: 'cat-1' },
        { id: 'item-2', name: 'Available', price: 900, categoryId: 'cat-1' },
      ],
    }

    const plan = mapHubboMenuToLocal(menu, NOW)

    expect(plan.items[0].isAvailable).toBe(false)
    expect(plan.items[1].isAvailable).toBe(true)
  })

  it('skips malformed entries and reports them as warnings', () => {
    const menu: HubboMerchantMenu = {
      categories: [{ name: 'no id' }],
      items: [
        { name: 'no id', price: 100 },
        { id: 'item-2', name: 'no price' },
        { id: 'item-3', name: 'bad price', priceInTwoDecimal: 'abc' },
      ],
    }

    const plan = mapHubboMenuToLocal(menu, NOW)

    expect(plan.categories).toHaveLength(0)
    expect(plan.items).toHaveLength(0)
    expect(plan.warnings.join(' ')).toContain('no parsable price')
  })
})

describe('pullHubboMenu', () => {
  const MENU: HubboMerchantMenu = {
    categories: [{ id: 'cat-1', name: 'Rice' }],
    items: [
      {
        id: 'item-1',
        name: 'Nasi Lemak',
        price: 1250,
        grabfoodPrice: 1300,
        sku: 'GF-NL-1',
        categoryId: 'cat-1',
      },
    ],
  }

  const fakeClient = { getMenu: async () => MENU }

  function supabaseMock() {
    const calls: Array<{ table: string; op: string; payload?: unknown }> = []
    const client = {
      from(table: string) {
        const builder = {
          select(_cols?: string) {
            return builder
          },
          eq(_col: string, _val: unknown) {
            return builder
          },
          update(payload: unknown) {
            calls.push({ table, op: 'update', payload })
            return {
              ...builder,
              then: (resolve: (v: { data: null; error: null }) => void) =>
                resolve({ data: null, error: null }),
            }
          },
          insert(payload: unknown) {
            calls.push({ table, op: 'insert', payload })
            return {
              select() {
                return {
                  single: async () => ({ data: { id: `${table}-new-id` }, error: null }),
                }
              },
            }
          },
          maybeSingle: async () => ({ data: null, error: null }),
          then(resolve: (v: { data: unknown[]; error: null }) => void) {
            resolve({ data: [], error: null })
          },
        }
        return builder
      },
    }
    return { client, calls }
  }

  it('dry run fetches and maps without writing', async () => {
    const { client, calls } = supabaseMock()

    const result = await pullHubboMenu(client as unknown as SupabaseClient, { dryRun: true, client: fakeClient })

    expect(result.dryRun).toBe(true)
    expect(result.categoriesUpserted).toBe(0)
    expect(result.itemsUpserted).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('upserts categories/items and seeds the GrabFood channel mapping', async () => {
    const { client, calls } = supabaseMock()

    const result = await pullHubboMenu(client as unknown as SupabaseClient, { client: fakeClient })

    expect(result.dryRun).toBe(false)
    expect(result.categoriesUpserted).toBe(1)
    expect(result.itemsUpserted).toBe(1)
    expect(result.grabfoodMappingsCreated).toBe(1)

    const categoryUpsert = calls.find((c) => c.table === 'categories' && c.op === 'insert')
    expect(categoryUpsert?.payload).toMatchObject({
      name: 'Rice',
      hubbo_pos_source: HUBBO_MERCHANT_SOURCE,
    })
    const itemUpsert = calls.find((c) => c.table === 'menu_items' && c.op === 'insert')
    expect(itemUpsert?.payload).toMatchObject({
      name: 'Nasi Lemak',
      price_cents: 1250,
      hubbo_pos_sku: 'GF-NL-1',
    })
    const mappingInsert = calls.find((c) => c.table === 'channel_products')
    expect(mappingInsert?.payload).toMatchObject({
      channel: 'grabfood',
      external_item_id: 'GF-NL-1',
      price_cents: 1300,
    })
  })
})
