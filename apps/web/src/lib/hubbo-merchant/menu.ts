/**
 * Hubbo merchant menu pull — maps the alimentsBackend menu onto the local
 * catalog (categories/menu_items) and seeds GrabFood channel_products
 * mappings. UNOFFICIAL source; see docs/hubbo-re-findings.md.
 *
 * Provenance: rows are tagged hubbo_pos_source = 'aliments_backend' and keyed
 * on the hubbo_pos_external_id columns (distinct from the DRAFT developer-API
 * integration in lib/hubbopos/, which uses source 'hubbopos').
 *
 * Price assumptions — CONFIRMED against a live /api/merchant/menu pull:
 *   - `price` / `grabfoodPrice` are RM decimals (e.g. 14.5 = RM 14.50); multiply
 *     by 100 to get cents. `priceInTwoDecimal` is an optional string fallback.
 *   - `grabfoodPrice` of 0.0 means the item is NOT sold on GrabFood -> null.
 *   - item/category ids arrive as numbers; coerce to string.
 *   - item->category linkage is via `subCategories[0].id` (no `categoryId`).
 *   - `snoozeTill` is epoch-ms; a future value means sold-out (unavailable).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  HubboMerchantMenu,
  HubboMerchantMenuResponse,
  HubboMerchantMenuItem,
  HubboMerchantCategory,
} from './types'
import { createHubboMerchantClient, type HubboMerchantClient } from './client'

export const HUBBO_MERCHANT_SOURCE = 'aliments_backend'

export interface LocalCategoryUpsert {
  externalId: string
  name: string
  sortOrder: number
}

export interface LocalItemUpsert {
  externalId: string
  sku: string | null
  name: string
  description: string | null
  priceCents: number
  isAvailable: boolean
  externalCategoryId: string | null
  grabfoodPriceCents: number | null
}

export interface HubboMenuToLocalResult {
  categories: LocalCategoryUpsert[]
  items: LocalItemUpsert[]
  /** Raw item entries examined (flat `menu[]` or nested) before filtering. */
  scanned: number
  warnings: string[]
}

export interface HubboMenuPullResult {
  dryRun: boolean
  categoriesUpserted: number
  itemsUpserted: number
  grabfoodMappingsCreated: number
  skipped: { reason: string; count: number }[]
  warnings: string[]
}

/** Hubbo snoozeTill is epoch-ms; active while in the future. */
function isSnoozedEpoch(snoozeTill: number | undefined | null, nowMs: number): boolean {
  if (snoozeTill == null || snoozeTill <= 0) return false
  // Defensive heuristic: values below 10^12 are seconds; above are ms.
  const ms = snoozeTill < 1e12 ? snoozeTill * 1000 : snoozeTill
  return ms > nowMs
}

/** Ids arrive as numbers on live payloads; normalise to string. */
function idToStr(id: string | number | undefined | null): string | null {
  if (id == null) return null
  const s = String(id)
  return s.length > 0 ? s : null
}

/** `price` is an RM decimal (14.5) -> cents (1450). */
function priceToCents(
  item: Pick<HubboMerchantMenuItem, 'price' | 'priceInTwoDecimal'>
): number | null {
  if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price >= 0) {
    return Math.round(item.price * 100)
  }
  if (typeof item.priceInTwoDecimal === 'string') {
    const parsed = Number.parseFloat(item.priceInTwoDecimal)
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed * 100)
  }
  return null
}

/**
 * GrabFood selling price is an RM decimal; 0.0 (or missing/invalid) means the
 * item is NOT offered on GrabFood -> null.
 */
function grabfoodPriceToCents(grabfoodPrice: number | null | undefined): number | null {
  if (typeof grabfoodPrice !== 'number' || !Number.isFinite(grabfoodPrice)) return null
  if (grabfoodPrice <= 0) return null
  return Math.round(grabfoodPrice * 100)
}

/** Pure mapping: Hubbo menu -> local upsert plan (no I/O, fully testable). */
export function mapHubboMenuToLocal(
  menu: HubboMerchantMenu | HubboMerchantMenuResponse,
  nowMs: number = Date.now()
): HubboMenuToLocalResult {
  const warnings: string[] = []
  const categories: LocalCategoryUpsert[] = []
  const seenCategoryIds = new Set<string>()

  const rawCategories = menu.categories ?? []
  rawCategories.forEach((category: HubboMerchantCategory, index: number) => {
    const id = idToStr(category.id)
    if (!id || !category.name) {
      warnings.push(`category#${index}: missing id/name — skipped`)
      return
    }
    if (seenCategoryIds.has(id)) return
    seenCategoryIds.add(id)
    categories.push({
      externalId: id,
      name: category.name,
      sortOrder: index,
    })
  })

  // Live responses are flat (menu[]); older/nested shapes put items under
  // categories. Accept both, preferring the flat list when present.
  const flatItems = (menu as HubboMerchantMenuResponse).menu
  const rawItems: HubboMerchantMenuItem[] =
    flatItems && flatItems.length > 0
      ? flatItems
      : rawCategories.flatMap((c) => c.items ?? [])

  const items: LocalItemUpsert[] = []
  const skipped = { noIdOrName: 0, noPrice: 0 }
  for (const item of rawItems) {
    const externalId = idToStr(item.id)
    if (!externalId || !item.name) {
      skipped.noIdOrName += 1
      continue
    }
    const priceCents = priceToCents(item)
    if (priceCents === null) {
      skipped.noPrice += 1
      warnings.push(`item "${item.name}": no parsable price — skipped`)
      continue
    }
    // Live linkage: subCategories[0].id; fall back to any categoryId if present.
    const subId = item.subCategories?.[0]?.id
    const externalCategoryId = idToStr(subId) ?? idToStr(item.categoryId)
    const sku = typeof item.sku === 'string' && item.sku.length > 0 ? item.sku : externalId
    items.push({
      externalId,
      sku,
      name: item.name,
      description: item.desc ?? null,
      priceCents,
      isAvailable: !isSnoozedEpoch(item.snoozeTill, nowMs),
      externalCategoryId,
      grabfoodPriceCents: grabfoodPriceToCents(item.grabfoodPrice),
    })
  }

  const result: HubboMenuToLocalResult = { categories, items, scanned: rawItems.length, warnings }
  if (skipped.noIdOrName > 0) {
    result.warnings.push(`${skipped.noIdOrName} item(s) skipped: missing id/name`)
  }
  if (skipped.noPrice > 0) {
    result.warnings.push(`${skipped.noPrice} item(s) skipped: no parsable price`)
  }
  return result
}

/**
 * Pull the Hubbo menu and apply it to the local catalog. With dryRun=true no
 * writes happen and the computed plan sizes are returned instead.
 * The client is injectable for tests; production uses the real adapter.
 */
export async function pullHubboMenu(
  supabase: SupabaseClient,
  options: { dryRun?: boolean; client?: Pick<HubboMerchantClient, 'getMenu'> } = {}
): Promise<HubboMenuPullResult> {
  const client = options.client ?? createHubboMerchantClient()
  const menu = await client.getMenu()
  const plan = mapHubboMenuToLocal(menu)
  const dryRun = options.dryRun ?? false

  const result: HubboMenuPullResult = {
    dryRun,
    categoriesUpserted: 0,
    itemsUpserted: 0,
    grabfoodMappingsCreated: 0,
    skipped: [
      {
        reason: 'missing id/name or price',
        count: Math.max(0, plan.scanned - plan.items.length),
      },
    ],
    warnings: plan.warnings,
  }
  if (dryRun) {
    return result
  }

  const syncedAt = new Date().toISOString()

  // --- categories: upsert by external id (source-tagged rows only) ---
  const { data: existingCategories } = await supabase
    .from('categories')
    .select('id, hubbo_pos_external_id')
    .eq('hubbo_pos_source', HUBBO_MERCHANT_SOURCE)
  const categoryByExternalId = new Map<string, string>()
  for (const row of existingCategories ?? []) {
    if (row.hubbo_pos_external_id) categoryByExternalId.set(row.hubbo_pos_external_id, row.id)
  }

  for (const category of plan.categories) {
    const payload = {
      name: category.name,
      sort_order: category.sortOrder,
      is_active: true,
      hubbo_pos_external_id: category.externalId,
      hubbo_pos_source: HUBBO_MERCHANT_SOURCE,
      hubbo_pos_last_synced_at: syncedAt,
    }
    const existingId = categoryByExternalId.get(category.externalId)
    if (existingId) {
      const { error } = await supabase.from('categories').update(payload).eq('id', existingId)
      if (error) throw new Error(`category update failed: ${error.message}`)
    } else {
      const { data: inserted, error } = await supabase
        .from('categories')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw new Error(`category insert failed: ${error.message}`)
      if (inserted) {
        categoryByExternalId.set(category.externalId, (inserted as { id: string }).id)
      }
    }
    result.categoriesUpserted += 1
  }

  // --- items: upsert by external id, resolved against pulled categories ---
  const { data: existingItems } = await supabase
    .from('menu_items')
    .select('id, hubbo_pos_external_id')
    .eq('hubbo_pos_source', HUBBO_MERCHANT_SOURCE)
  const itemByExternalId = new Map<string, string>()
  for (const row of existingItems ?? []) {
    if (row.hubbo_pos_external_id) itemByExternalId.set(row.hubbo_pos_external_id, row.id)
  }

  const upsertedExternalIds = new Set<string>()
  for (const item of plan.items) {
    const categoryId = item.externalCategoryId
      ? categoryByExternalId.get(item.externalCategoryId)
      : null
    if (!categoryId) {
      result.warnings.push(`item "${item.name}": category not in pull — skipped`)
      continue
    }
    const payload = {
      category_id: categoryId,
      name: item.name,
      description: item.description,
      price_cents: item.priceCents,
      is_available: item.isAvailable,
      hubbo_pos_external_id: item.externalId,
      hubbo_pos_sku: item.sku,
      hubbo_pos_source: HUBBO_MERCHANT_SOURCE,
      hubbo_pos_last_synced_at: syncedAt,
    }
    let localItemId = itemByExternalId.get(item.externalId)
    if (localItemId) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', localItemId)
      if (error) throw new Error(`item update failed: ${error.message}`)
    } else {
      const { data: inserted, error } = await supabase
        .from('menu_items')
        .insert(payload)
        .select('id')
        .single()
      if (error) throw new Error(`item insert failed: ${error.message}`)
      localItemId = (inserted as { id: string }).id
      itemByExternalId.set(item.externalId, localItemId)
    }
    upsertedExternalIds.add(item.externalId)
    result.itemsUpserted += 1
  }

  // --- GrabFood channel mapping: seed channel_products for pulled items ---
  for (const item of plan.items) {
    if (!upsertedExternalIds.has(item.externalId)) continue
    const localItemId = itemByExternalId.get(item.externalId)
    if (!localItemId) continue
    const { data: existingMapping } = await supabase
      .from('channel_products')
      .select('id')
      .eq('channel', 'grabfood')
      .eq('menu_item_id', localItemId)
      .maybeSingle()
    if (existingMapping) continue
    const { error } = await supabase.from('channel_products').insert({
      channel: 'grabfood',
      menu_item_id: localItemId,
      external_item_id: item.sku ?? item.externalId,
      external_name: item.name,
      price_cents: item.grabfoodPriceCents,
    })
    if (error) {
      // A unique violation means a concurrent pull got there first — not fatal.
      if ((error as { code?: string }).code !== '23505') {
        throw new Error(`channel_products insert failed: ${error.message}`)
      }
      continue
    }
    result.grabfoodMappingsCreated += 1
  }

  return result
}
