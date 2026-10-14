import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mapHubboMenuToLocal, pullHubboMenu, HUBBO_MERCHANT_SOURCE } from '../menu'
import type { HubboMerchantMenuResponse } from '../types'
// Real captured payload from a live /api/merchant/menu pull (see runbook). Proves
// the response is a FLAT envelope: { code, menu[], categories[] } with RM-decimal
// prices and item->category linkage via subCategories[0].id.
import liveResponse from './fixtures/live-menu-response.json'

const NOW = new Date('2026-10-13T00:00:00Z').getTime()

describe('mapHubboMenuToLocal', () => {
  it('maps the live flat envelope: menu[] items, subCategories link, RM-decimal prices', () => {
    const plan = mapHubboMenuToLocal(liveResponse as unknown as HubboMerchantMenuResponse, NOW)

    expect(plan.categories).toEqual([
      { externalId: '31730001', name: 'Set Krapow', sortOrder: 0 },
      { externalId: '31730002', name: 'Lauk Sahaja', sortOrder: 1 },
      { externalId: '31730004', name: 'Minuman', sortOrder: 2 },
    ])
    expect(plan.items).toHaveLength(16)

    const first = plan.items.find((i) => i.externalId === '31730001')!
    expect(first).toMatchObject({
      name: 'Set Krapow Daging dengan Minuman',
      priceCents: 1450, // 14.50 RM, not 15 (sen) — the 100x bug is fixed
      grabfoodPriceCents: 1930, // 19.30 RM
      isAvailable: true,
      externalCategoryId: '31730001',
    })
    expect(plan.warnings).toEqual([])
  })

  it('treats grabfoodPrice 0.0 as not-on-GrabFood (null), not 0 cents', () => {
    const plan = mapHubboMenuToLocal(liveResponse as unknown as HubboMerchantMenuResponse, NOW)
    const notOnGrab = plan.items.filter(
      (i) => i.externalId === '31730033' || i.externalId === '31730034'
    )
    expect(notOnGrab).toHaveLength(2)
    for (const item of notOnGrab) expect(item.grabfoodPriceCents).toBeNull()
  })

  it('treats a future snoozeTill (epoch ms) as unavailable', () => {
    const plan = mapHubboMenuToLocal(liveResponse as unknown as HubboMerchantMenuResponse, NOW)
    for (const id of ['31730027', '31730023', '31730028']) {
      expect(plan.items.find((i) => i.externalId === id)!.isAvailable).toBe(false)
    }
    expect(plan.items.find((i) => i.externalId === '31730001')!.isAvailable).toBe(true)
  })

  it('accepts items nested under categories when there is no flat menu[] list', () => {
    const menu: HubboMerchantMenuResponse = {
      categories: [{ id: 1, name: 'Rice', items: [{ id: 10, name: 'X', price: 9.0 }] }],
    }
    const plan = mapHubboMenuToLocal(menu, NOW)
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0]).toMatchObject({ externalId: '10', priceCents: 900, externalCategoryId: null })
  })

  it('skips malformed entries and reports them as warnings', () => {
    const menu: HubboMerchantMenuResponse = {
      categories: [{ name: 'no id' }],
      menu: [
        { name: 'no id', price: 5 },
        { id: 2, name: 'no price' },
        { id: 3, name: 'bad price', priceInTwoDecimal: 'abc' },
      ],
    }
    const plan = mapHubboMenuToLocal(menu, NOW)
    expect(plan.categories).toHaveLength(0)
    expect(plan.items).toHaveLength(0)
    expect(plan.warnings.join(' ')).toContain('no parsable price')
  })
})

describe('pullHubboMenu', () => {
  const MENU: HubboMerchantMenuResponse = {
    categories: [{ id: 1, name: 'Rice' }],
    menu: [
      {
        id: 10,
        name: 'Nasi Lemak',
        price: 12.5,
        grabfoodPrice: 13.0,
        sku: 'GF-NL-1',
        subCategories: [{ id: 1 }],
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
    const result = await pullHubboMenu(client as unknown as SupabaseClient, {
      dryRun: true,
      client: fakeClient,
    })
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
      price_cents: 1250, // 12.50 RM
      hubbo_pos_sku: 'GF-NL-1',
    })
    const mappingInsert = calls.find((c) => c.table === 'channel_products')
    expect(mappingInsert?.payload).toMatchObject({
      channel: 'grabfood',
      external_item_id: 'GF-NL-1',
      price_cents: 1300, // 13.00 RM
    })
  })
})
