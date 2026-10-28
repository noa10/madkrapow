/**
 * Pure helpers for customer table-QR orders.
 *
 * The route handler owns the database reads; these functions own the parts
 * that must be identical in tests and production: duplicate-line merging,
 * deterministic line pricing and payload bounds.
 */

import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '@/lib/menu/quantity'
import { isPaidOrderStatus } from '@/lib/pos/receipt'

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

/**
 * Integer-cents line total: (base + sum of modifier deltas) × quantity.
 *
 * Floored at zero: a negative delta larger than the base price must not turn a
 * line (or the order) negative — `orders.total_cents` has no CHECK >= 0.
 */
export function lineTotalCents(
  basePriceCents: number,
  modifierDeltas: readonly number[],
  quantity: number
): number {
  const unit = modifierDeltas.reduce(
    (sum, delta) => sum + delta,
    basePriceCents
  )
  return Math.max(0, unit) * quantity
}

/** How the diner chose to settle the bill on the review step. */
export type TablePaymentChoice = 'qr' | 'counter'

/** Which screen the table-QR page is showing. */
export type TableOrderStep = 'menu' | 'review' | 'payment' | 'success'

/**
 * The step that follows a successful create.
 *
 * A QR choice goes through the payment screen so the diner can scan and claim;
 * a counter choice is done once the order reaches the kitchen.
 */
export function nextStepAfterCreate(
  choice: TablePaymentChoice
): 'payment' | 'success' {
  return choice === 'qr' ? 'payment' : 'success'
}

/**
 * Body for `POST /api/public/table-orders/[id]/pay`.
 *
 * The idempotency key is the order's own create key: it is what proves the
 * caller created this order, so it must survive the create request.
 */
export function buildTablePaymentClaimPayload(input: {
  tableToken: string
  idempotencyKey: string
}): { table_token: string; idempotency_key: string } {
  return {
    table_token: input.tableToken,
    idempotency_key: input.idempotencyKey,
  }
}

/**
 * The status the success screen shows after a claim (or after a 409).
 *
 * A paid allowlist status, or `already_paid` from the ledger, means the money
 * moved even if `status` still reads `pending`; anything else is adopted as
 * given so a cancelled order cannot keep a scannable QR on screen.
 */
export function resolveClaimStatus(
  current: string,
  claim: { status: string; already_paid?: boolean } | null
): string {
  if (!claim) return current
  if (claim.already_paid === true || isPaidOrderStatus(claim.status)) {
    return 'paid'
  }
  return claim.status
}

/**
 * The order a diner just created, as resumed after a reload.
 *
 * The payment step tells the diner to open their banking app; on a phone the
 * page can be discarded while they do, taking the order id and the claim key
 * with it. Persisting both to `sessionStorage` (per-tab, cleared with the tab —
 * never `localStorage`, which would outlive the meal on a shared phone) lets
 * the page resume the payment step instead of stranding a paid diner.
 */
export interface StoredTableOrder {
  success: {
    order_id: string
    order_number: string
    display_code: string | null
    total_cents: number
    table_label: string
    pax: number | null
    status: string
    paid_at?: string | null
  }
  idempotencyKey: string
}

export function serializeStoredTableOrder(order: StoredTableOrder): string {
  return JSON.stringify(order)
}

/**
 * Parse a stored order, or null when it is absent or does not have the shape
 * this module wrote. Session storage is writable by any script on the origin,
 * so a partial or foreign payload must not become state.
 */
export function parseStoredTableOrder(raw: string | null): StoredTableOrder | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const candidate = parsed as {
    success?: unknown
    idempotencyKey?: unknown
  }
  const key = candidate.idempotencyKey
  if (typeof key !== 'string' || key.length === 0) return null

  const success = candidate.success
  if (typeof success !== 'object' || success === null) return null
  const order = success as Record<string, unknown>
  if (typeof order.order_id !== 'string' || order.order_id.length === 0) return null
  if (typeof order.order_number !== 'string') return null
  if (typeof order.total_cents !== 'number') return null
  if (typeof order.table_label !== 'string') return null
  if (typeof order.status !== 'string') return null
  if (order.pax !== null && typeof order.pax !== 'number') return null
  if (
    order.display_code !== null &&
    order.display_code !== undefined &&
    typeof order.display_code !== 'string'
  ) {
    return null
  }

  return parsed as StoredTableOrder
}
