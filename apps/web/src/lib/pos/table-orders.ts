/**
 * Pure helpers for customer table-QR orders.
 *
 * The route handler owns the database reads; these functions own the parts
 * that must be identical in tests and production: duplicate-line merging,
 * deterministic line pricing and payload bounds.
 */

import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '@/lib/menu/quantity'
import { isPaidOrderStatus } from '@/lib/pos/receipt'
import type {
  TableOrderStatus,
  TableOrderSuccess,
  TablePaymentClaim,
} from '@/lib/pos/types'

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
 * What a claim did to the order, and how the money was recorded.
 */
export interface ClaimOutcome {
  /** The status the screen shows. */
  status: string
  /** The recorded payment method, or null when the server did not say. */
  paymentMethod: string | null
  /**
   * True when the order was already paid before this claim — by a cashier, or
   * by an earlier claim whose response was lost.
   */
  alreadyPaid: boolean
}

/**
 * Read a claim response without losing the payment method.
 *
 * `already_paid` says the money had already moved; it does NOT say *this*
 * diner's transfer was the one recorded. A cashier-settled order comes back as
 * `already_paid` with `payment_method: 'cash'`, and the screen must say
 * "already paid at the counter" rather than "payment received" — otherwise the
 * diner is told their QR transfer was banked when it was not.
 */
export function resolveClaimOutcome(
  current: string,
  claim:
    | {
        status?: string
        already_paid?: boolean
        payment_method?: string | null
      }
    | null
  ): ClaimOutcome {
  if (!claim || typeof claim.status !== 'string') {
    return { status: current, paymentMethod: null, alreadyPaid: false }
  }
  const paymentMethod =
    typeof claim.payment_method === 'string' ? claim.payment_method : null
  const alreadyPaid = claim.already_paid === true
  if (alreadyPaid || isPaidOrderStatus(claim.status)) {
    return { status: 'paid', paymentMethod, alreadyPaid }
  }
  return { status: claim.status, paymentMethod, alreadyPaid: false }
}

/** How the diner's screen should read an order's payment state. */
export type TablePaymentTone =
  /** Paid by the diner's own QR claim. */
  | 'paid_by_qr'
  /** Paid by someone else (a cashier, a gateway) — not by this diner. */
  | 'paid_elsewhere'
  | 'cancelled'
  | 'unpaid'

/**
 * Which payment story the screen tells.
 *
 * A paid order whose recorded method is not `qr_pay` was settled by staff, so
 * the screen must not claim the diner's QR transfer was received. An unknown
 * method on a paid order stays "received": the money did move.
 */
export function tablePaymentTone(input: {
  status: string
  paymentMethod?: string | null
}): TablePaymentTone {
  if (input.status === 'cancelled') return 'cancelled'
  if (!isPaidOrderStatus(input.status)) return 'unpaid'
  const method = input.paymentMethod
  if (method && method !== 'qr_pay') return 'paid_elsewhere'
  return 'paid_by_qr'
}

/**
 * True when a create response is a retry of an order that already exists AND
 * the cart no longer matches it.
 *
 * The server matched the idempotency key, so the order it returned holds the
 * items that were sent the first time. A different cart total means the diner
 * edited the order after the lost response — those edits were never sent.
 */
export function isChangedDuplicate(
  created: { duplicate?: boolean; total_cents: number },
  cartSubtotalCents: number
): boolean {
  return created.duplicate === true && created.total_cents !== cartSubtotalCents
}

/**
 * True when a server-confirmed state still allows a QR claim.
 *
 * A succeeded payment row means the money moved even if the status has not
 * caught up, so it is never payable again.
 */
export function isPayableOrder(input: {
  status: string
  paymentRecorded?: boolean
}): boolean {
  return input.status === 'pending' && input.paymentRecorded !== true
}

/**
 * The status a live read should show.
 *
 * A succeeded payment row proves the money moved even when `orders.status`
 * still reads `pending`; showing "unpaid" there would invite a second payment.
 * Cancellation outranks the ledger so a refunded order never reads as paid.
 */
export function resolveLiveStatus(
  status: string,
  paymentRecorded: boolean
): string {
  if (status === 'cancelled') return status
  if (paymentRecorded && !isPaidOrderStatus(status)) return 'paid'
  return status
}

/**
 * True when a live read is older than what the screen already knows.
 *
 * Order status only moves forward (pending → paid → kitchen). A read that
 * still says `pending` after the screen has seen the order paid is a response
 * to a request that left before the claim committed — applying it would put a
 * live payment QR back on a paid order.
 */
export function isStaleLiveRead(
  currentStatus: string,
  liveStatus: string
): boolean {
  return isPaidOrderStatus(currentStatus) && liveStatus === 'pending'
}

/**
 * Body for `POST /api/public/table-orders/[id]/status`.
 *
 * Same capability as the claim: the table token proves the caller is at the
 * table, the idempotency key proves they created this order.
 */
export function buildTablePaymentStatusPayload(input: {
  tableToken: string
  idempotencyKey: string
}): { table_token: string; idempotency_key: string } {
  return {
    table_token: input.tableToken,
    idempotency_key: input.idempotencyKey,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Read a create response, or null when the body is not an order.
 *
 * A 2xx with an unreadable body is not an order: the client must not clear the
 * diner's cart or route to the success screen on a body it could not parse.
 */
export function parseTableOrderSuccess(data: unknown): TableOrderSuccess | null {
  if (!isRecord(data)) return null
  if (typeof data.order_id !== 'string' || data.order_id.length === 0) {
    return null
  }
  if (typeof data.order_number !== 'string') return null
  if (typeof data.total_cents !== 'number') return null
  // A duplicate create echoes the stored row, and legacy rows can have a null
  // label. Rejecting those would make every retry unreadable.
  if (
    data.table_label !== null &&
    data.table_label !== undefined &&
    typeof data.table_label !== 'string'
  ) {
    return null
  }
  if (typeof data.status !== 'string') return null
  if (data.pax !== null && data.pax !== undefined && typeof data.pax !== 'number') {
    return null
  }
  if (
    data.display_code !== null &&
    data.display_code !== undefined &&
    typeof data.display_code !== 'string'
  ) {
    return null
  }
  if (
    data.payment_method !== null &&
    data.payment_method !== undefined &&
    typeof data.payment_method !== 'string'
  ) {
    return null
  }
  if (
    data.paid_at !== null &&
    data.paid_at !== undefined &&
    typeof data.paid_at !== 'string'
  ) {
    return null
  }
  return {
    order_id: data.order_id,
    order_number: data.order_number,
    display_code: (data.display_code as string | null | undefined) ?? null,
    total_cents: data.total_cents,
    table_label: (data.table_label as string | null | undefined) ?? '',
    pax: (data.pax as number | null | undefined) ?? null,
    status: data.status,
    paid_at: (data.paid_at as string | null | undefined) ?? null,
    payment_method: (data.payment_method as string | null | undefined) ?? null,
    duplicate: data.duplicate === true,
    already_paid: data.already_paid === true,
  }
}

/**
 * Read a claim response, or null when the body is not a claim.
 *
 * The 409 branch used to guard a null body and the success branch did not, so
 * an unparseable 2xx threw inside a state updater and took down the page.
 */
export function parseTablePaymentClaim(data: unknown): TablePaymentClaim | null {
  if (!isRecord(data)) return null
  if (typeof data.status !== 'string') return null
  if (typeof data.amount_cents !== 'number') return null
  if (
    data.payment_method !== null &&
    data.payment_method !== undefined &&
    typeof data.payment_method !== 'string'
  ) {
    return null
  }
  if (
    data.paid_at !== null &&
    data.paid_at !== undefined &&
    typeof data.paid_at !== 'string'
  ) {
    return null
  }
  if (
    data.already_paid !== null &&
    data.already_paid !== undefined &&
    typeof data.already_paid !== 'boolean'
  ) {
    return null
  }
  return {
    ok: true,
    order_id: typeof data.order_id === 'string' ? data.order_id : '',
    status: data.status,
    amount_cents: data.amount_cents,
    payment_method: (data.payment_method as string | null | undefined) ?? null,
    paid_at: (data.paid_at as string | null | undefined) ?? null,
    already_paid: data.already_paid === true,
  }
}

/**
 * Read a status response, or null when the body is not a status.
 *
 * A status the client cannot read is treated as "unknown", never as "pending":
 * an unreadable body must not put a live payment QR back on screen.
 */
export function parseTableOrderStatus(data: unknown): TableOrderStatus | null {
  if (!isRecord(data)) return null
  if (typeof data.status !== 'string') return null
  if (typeof data.total_cents !== 'number') return null
  if (
    data.payment_method !== null &&
    data.payment_method !== undefined &&
    typeof data.payment_method !== 'string'
  ) {
    return null
  }
  if (
    data.paid_at !== null &&
    data.paid_at !== undefined &&
    typeof data.paid_at !== 'string'
  ) {
    return null
  }
  if (
    data.payment_recorded !== null &&
    data.payment_recorded !== undefined &&
    typeof data.payment_recorded !== 'boolean'
  ) {
    return null
  }
  return {
    order_id: typeof data.order_id === 'string' ? data.order_id : '',
    status: data.status,
    total_cents: data.total_cents,
    payment_method: (data.payment_method as string | null | undefined) ?? null,
    paid_at: (data.paid_at as string | null | undefined) ?? null,
    payment_recorded: data.payment_recorded === true,
  }
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
    /**
     * The recorded payment method, when the last response carried one. A
     * resumed screen must be able to say "already paid at the counter"
     * without waiting for the status refresh.
     */
    payment_method?: string | null
    already_paid?: boolean
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
  if (
    order.payment_method !== null &&
    order.payment_method !== undefined &&
    typeof order.payment_method !== 'string'
  ) {
    return null
  }
  if (
    order.already_paid !== null &&
    order.already_paid !== undefined &&
    typeof order.already_paid !== 'boolean'
  ) {
    return null
  }

  return parsed as StoredTableOrder
}
