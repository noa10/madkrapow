/**
 * Menu synchronization: MadKrapow product (master) -> GrabFood records.
 *
 * channel_products holds the per-channel mapping (external_item_id, channel
 * price override, availability). This module builds the record updates Grab's
 * API consumes (PUT /partner/v1/menu, PUT /partner/v1/batch/menu) and surfaces
 * mapping gaps for the admin UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrabMenuRecordUpdate } from './types'

export interface GrabMenuMappingRow {
  channel_product_id: string
  menu_item_id: string
  menu_item_name: string
  menu_item_price_cents: number
  menu_item_is_available: boolean
  external_item_id: string | null
  external_name: string | null
  channel_price_cents: number | null
  channel_is_available: boolean
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
      menu_items (
        id,
        name,
        price_cents,
        is_available
      )
    `
    )
    .eq('channel', 'grabfood')

  if (error) return { mappings: [], error: error.message }

  const mappings: GrabMenuMappingRow[] = (data ?? []).map((row) => {
    const raw = row.menu_items as
      | { id: string; name: string; price_cents: number; is_available: boolean }
      | Array<{ id: string; name: string; price_cents: number; is_available: boolean }>
      | null
    const item = Array.isArray(raw) ? raw[0] : raw
    return {
      channel_product_id: row.id,
      menu_item_id: item?.id ?? '',
      menu_item_name: item?.name ?? '(deleted item)',
      menu_item_price_cents: item?.price_cents ?? 0,
      menu_item_is_available: item?.is_available ?? false,
      external_item_id: row.external_item_id,
      external_name: row.external_name,
      channel_price_cents: row.price_cents,
      channel_is_available: row.is_available,
    }
  })
  return { mappings, error: null }
}

/**
 * Build Grab menu record updates for every fully-mapped product.
 * Price: channel override when set, else the master price.
 * Availability: master AND channel availability (master out-of-stock wins).
 */
export function buildMenuRecordUpdates(
  mappings: GrabMenuMappingRow[],
  merchantId: string
): GrabMenuRecordUpdate[] {
  return mappings
    .filter((m) => m.external_item_id && m.menu_item_id)
    .map((m) => ({
      merchantID: merchantId,
      field: 'ITEM' as const,
      id: m.external_item_id as string,
      price: (m.channel_price_cents ?? m.menu_item_price_cents),
      availableStatus:
        m.menu_item_is_available && m.channel_is_available ? 'AVAILABLE' : 'UNAVAILABLE',
    }))
}

/** Item-level update when the POS changes one product's price or stock. */
export function buildSingleItemUpdate(
  mapping: GrabMenuMappingRow,
  merchantId: string
): GrabMenuRecordUpdate | null {
  if (!mapping.external_item_id) return null
  return buildMenuRecordUpdates([mapping], merchantId)[0] ?? null
}
