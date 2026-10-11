/**
 * Menu synchronization: MadKrapow product (master) -> GrabFood records.
 *
 * channel_products holds the per-channel mapping (external_item_id, channel
 * price override, availability, snooze). This module builds the record updates
 * Grab's API consumes (PUT /partner/v1/menu, PUT /partner/v1/batch/menu) and
 * surfaces mapping gaps for the admin UI.
 *
 * Grab semantics (per the official OpenAPI models):
 *   - availableStatus: AVAILABLE | UNAVAILABLE | UNAVAILABLETODAY
 *   - UNAVAILABLE must be accompanied by maxStock = 0; maxStock > 0 implies
 *     AVAILABLE. UNAVAILABLETODAY auto-restores at Grab's next business day.
 *
 * Snooze (time-based sold-out) maps onto those states: a snooze ending within
 * the merchant's calendar day (Asia/Kuala_Lumpur, UTC+8 fixed) becomes
 * UNAVAILABLETODAY so Grab restores it without another push; longer snoozes
 * and hard unavailable flags become UNAVAILABLE + maxStock 0.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GrabAvailableStatus,
  GrabBatchMenuEntry,
  GrabMenuEntity,
  GrabMenuRecordUpdate,
} from './types'

/** Malaysia never observes DST: MYT is a fixed UTC+8 offset. */
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

export interface GrabMenuMappingRow {
  channel_product_id: string
  menu_item_id: string
  menu_item_name: string
  menu_item_price_cents: number
  menu_item_is_available: boolean
  menu_item_snooze_till: string | null
  menu_item_category_id: string | null
  external_category_id: string | null
  external_item_id: string | null
  external_name: string | null
  channel_price_cents: number | null
  channel_is_available: boolean
  channel_snooze_till: string | null
}

export async function fetchGrabMenuMappings(
  supabase: SupabaseClient
): Promise<{ mappings: GrabMenuMappingRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('channel_products')
    .select(
      `
      id,
      external_item_id,
      external_name,
      price_cents,
      is_available,
      snooze_till,
      menu_items (
        id,
        name,
        price_cents,
        is_available,
        snooze_till,
        category_id
      )
    `
    )
    .eq('channel', 'grabfood')

  if (error) return { mappings: [], error: error.message }

  const mappings: GrabMenuMappingRow[] = (data ?? []).map((row) => {
    const raw = row.menu_items as
      | {
          id: string
          name: string
          price_cents: number
          is_available: boolean
          snooze_till: string | null
          category_id: string | null
        }
      | Array<{
          id: string
          name: string
          price_cents: number
          is_available: boolean
          snooze_till: string | null
          category_id: string | null
        }>
      | null
    const item = Array.isArray(raw) ? raw[0] : raw
    return {
      channel_product_id: row.id,
      menu_item_id: item?.id ?? '',
      menu_item_name: item?.name ?? '(deleted item)',
      menu_item_price_cents: item?.price_cents ?? 0,
      menu_item_is_available: item?.is_available ?? false,
      menu_item_snooze_till: item?.snooze_till ?? null,
      menu_item_category_id: item?.category_id ?? null,
      external_category_id: null,
      external_item_id: row.external_item_id,
      external_name: row.external_name,
      channel_price_cents: row.price_cents,
      channel_is_available: row.is_available,
      channel_snooze_till: row.snooze_till ?? null,
    }
  })
  return { mappings, error: null }
}

export interface ChannelCategoryMappingRow {
  channel_category_id: string
  category_id: string
  category_name: string
  category_sort_order: number
  category_is_active: boolean
  external_category_id: string | null
  external_name: string | null
  sort_order: number
}

/** Category-level mapping (channel_categories ⋈ categories) for the admin UI. */
export async function fetchChannelCategoryMappings(
  supabase: SupabaseClient
): Promise<{ categories: ChannelCategoryMappingRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('channel_categories')
    .select(
      `
      id,
      external_category_id,
      external_name,
      sort_order,
      categories (
        id,
        name,
        sort_order,
        is_active
      )
    `
    )
    .eq('channel', 'grabfood')

  if (error) return { categories: [], error: error.message }

  const categories: ChannelCategoryMappingRow[] = (data ?? []).map((row) => {
    const raw = row.categories as
      | { id: string; name: string; sort_order: number; is_active: boolean }
      | Array<{ id: string; name: string; sort_order: number; is_active: boolean }>
      | null
    const category = Array.isArray(raw) ? raw[0] : raw
    return {
      channel_category_id: row.id,
      category_id: category?.id ?? '',
      category_name: category?.name ?? '(deleted category)',
      category_sort_order: category?.sort_order ?? 0,
      category_is_active: category?.is_active ?? false,
      external_category_id: row.external_category_id,
      external_name: row.external_name,
      sort_order: row.sort_order,
    }
  })
  return { categories, error: null }
}

/** A snooze is active while `snoozeTill` is in the future. */
export function isSnoozed(snoozeTill: string | null | undefined, now: Date = new Date()): boolean {
  if (!snoozeTill) return false
  const t = new Date(snoozeTill).getTime()
  return !Number.isNaN(t) && t > now.getTime()
}

/**
 * True when the snooze ends within the merchant's current calendar day in
 * Malaysia (UTC+8). Such snoozes can ride Grab's UNAVAILABLETODAY, which
 * auto-restores at Grab's side when the day rolls over.
 */
export function isSnoozeSameDay(snoozeTill: string, now: Date = new Date()): boolean {
  const t = new Date(snoozeTill).getTime()
  if (Number.isNaN(t)) return false
  const dayOf = (ms: number) => Math.floor((ms + MYT_OFFSET_MS) / 86_400_000)
  return dayOf(t) === dayOf(now.getTime())
}

/**
 * Effective availability: master AND channel, each also gated by an active
 * snooze. Computed at read time — an expired snooze never needs a write.
 */
export function isEffectivelyAvailable(
  mapping: Pick<
    GrabMenuMappingRow,
    | 'menu_item_is_available'
    | 'menu_item_snooze_till'
    | 'channel_is_available'
    | 'channel_snooze_till'
  >,
  now: Date = new Date()
): boolean {
  return (
    mapping.menu_item_is_available &&
    !isSnoozed(mapping.menu_item_snooze_till, now) &&
    mapping.channel_is_available &&
    !isSnoozed(mapping.channel_snooze_till, now)
  )
}

/** Map a mapping row's effective state onto Grab's availableStatus enum. */
export function grabAvailableStatusFor(
  mapping: Pick<
    GrabMenuMappingRow,
    | 'menu_item_is_available'
    | 'menu_item_snooze_till'
    | 'channel_is_available'
    | 'channel_snooze_till'
  >,
  now: Date = new Date()
): GrabAvailableStatus {
  if (isEffectivelyAvailable(mapping, now)) return 'AVAILABLE'
  // Prefer the auto-restoring state when the snooze ends today.
  const snoozeTill = [mapping.channel_snooze_till, mapping.menu_item_snooze_till]
    .filter((s): s is string => Boolean(s) && isSnoozed(s, now))
    .sort()[0]
  if (snoozeTill && isSnoozeSameDay(snoozeTill, now)) return 'UNAVAILABLETODAY'
  return 'UNAVAILABLE'
}

/**
 * Build Grab menu record updates for every fully-mapped product.
 * Price: channel override when set, else the master price.
 * Availability: effective (master AND channel AND snooze) — UNAVAILABLE
 * carries maxStock 0 as Grab requires.
 */
export function buildMenuRecordUpdates(
  mappings: GrabMenuMappingRow[],
  merchantId: string,
  now: Date = new Date()
): GrabMenuRecordUpdate[] {
  return mappings
    .filter((m) => m.external_item_id && m.menu_item_id)
    .map((m) => {
      const availableStatus = grabAvailableStatusFor(m, now)
      return {
        merchantID: merchantId,
        field: 'ITEM' as const,
        id: m.external_item_id as string,
        price: m.channel_price_cents ?? m.menu_item_price_cents,
        availableStatus,
        ...(availableStatus === 'UNAVAILABLE' ? { maxStock: 0 } : {}),
      }
    })
}

/** Item-level update when the POS changes one product's price or stock. */
export function buildSingleItemUpdate(
  mapping: GrabMenuMappingRow,
  merchantId: string,
  now: Date = new Date()
): GrabMenuRecordUpdate | null {
  if (!mapping.external_item_id) return null
  return buildMenuRecordUpdates([mapping], merchantId, now)[0] ?? null
}

/**
 * Wrap flat records into the batch endpoint's entry shape:
 * [{merchantID, field: 'ITEM', menuEntities: [...]}], chunked to `batchSize`
 * entities per entry (Grab's documented limit is 200).
 */
export function toBatchMenuEntries(
  records: GrabMenuRecordUpdate[],
  batchSize = 200
): GrabBatchMenuEntry[] {
  const groups = new Map<string, GrabBatchMenuEntry>()
  const entries: GrabBatchMenuEntry[] = []
  for (const record of records) {
    const key = `${record.merchantID}|${record.field}`
    let entry = groups.get(key)
    if (!entry || entry.menuEntities.length >= batchSize) {
      entry = { merchantID: record.merchantID, field: 'ITEM', menuEntities: [] }
      groups.set(key, entry)
      entries.push(entry)
    }
    const entity: GrabMenuEntity = { id: record.id }
    if (record.price !== undefined) entity.price = record.price
    if (record.availableStatus !== undefined) entity.availableStatus = record.availableStatus
    if (record.maxStock !== undefined) entity.maxStock = record.maxStock
    entry.menuEntities.push(entity)
  }
  return entries
}
