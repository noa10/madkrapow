/**
 * Pure helpers for customer table-QR orders.
 *
 * The route handler owns the database reads; these functions own the parts
 * that must be identical in tests and production: duplicate-line merging,
 * deterministic line pricing and payload bounds.
 */

import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '@/lib/menu/quantity'

export const MAX_TABLE_ORDER_ITEMS = 50
/** After merging duplicate lines a single dish may exceed one line's cap. */
export const MAX_MERGED_QUANTITY = 99
export const MAX_MODIFIERS_PER_ITEM = 20
export const MAX_ORDER_NOTES_LENGTH = 500
export const MAX_ITEM_NOTES_LENGTH = 200

export {
  MAX_ITEM_QUANTITY,
  MIN_ITEM_QUANTITY,
}

export type TableOrderItemInput = {
  menu_item_id: string
  quantity: number
  modifier_ids: string[]
  notes?: string
}

/** Stable key for "same item with the same selected options". */
export function modifierKey(ids: readonly string[]): string {
  return [...ids].sort().join(',')
}

/**
 * Collapse duplicate cart lines. Two lines of the same dish with different
 * modifiers *or different notes* are different lines and stay separate —
 * merging them would lose the customer's choices.
 */
export function mergeTableOrderItems(
  items: readonly TableOrderItemInput[]
): TableOrderItemInput[] {
  const merged = new Map<string, TableOrderItemInput>()

  for (const item of items) {
    const key = `${item.menu_item_id}|${modifierKey(item.modifier_ids)}|${item.notes ?? ''}`
    const existing = merged.get(key)
    if (existing) {
      merged.set(key, {
        ...existing,
        quantity: existing.quantity + item.quantity,
      })
    } else {
      merged.set(key, { ...item, modifier_ids: [...item.modifier_ids].sort() })
    }
  }

  return [...merged.values()]
}

/** Integer-cents line total: (base + sum of modifier deltas) × quantity. */
export function lineTotalCents(
  basePriceCents: number,
  modifierDeltas: readonly number[],
  quantity: number
): number {
  const unit = modifierDeltas.reduce(
    (sum, delta) => sum + delta,
    basePriceCents
  )
  return unit * quantity
}
