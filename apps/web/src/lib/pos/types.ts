/**
 * Shared types for the dine-in POS module (merchant table board + table QR).
 *
 * Kept framework-free so the same shapes can back route handlers, client
 * components and pure unit tests. Money is always integer cents.
 */

/** How a POS sale is fulfilled. Take-away reuses the existing pickup path. */
export type PosOrderType = 'dine_in' | 'take_away'

/** A physical table row (public columns — qr_token is staff-only). */
export interface RestaurantTable {
  id: string
  label: string
  zone: string | null
  seats: number
  qr_token: string
  is_active: boolean
  sort_order: number
}

/** Safe table fields rendered on the public table-QR ordering page. */
export interface PublicTable {
  id: string
  token: string
  label: string
  zone: string | null
  seats: number
}

/** Statuses that keep a dine-in table occupied. Mirrors the open-order index. */
export const OPEN_DINE_IN_STATUSES = [
  'pending',
  'paid',
  'accepted',
  'preparing',
  'ready',
] as const

export type OpenDineInStatus = (typeof OPEN_DINE_IN_STATUSES)[number]

/** One add-on on an embedded order item (table-card details). */
export interface PosOrderItemModifier {
  modifier_name: string
  modifier_price_delta_cents: number
}

/** A dish on an open POS order, embedded in the open-orders query. */
export interface PosOrderItem {
  id: string
  menu_item_name: string
  quantity: number
  line_total_cents: number
  notes: string | null
  order_item_modifiers: PosOrderItemModifier[] | null
}

/** The subset of an order the POS table board needs. */
export interface PosOpenOrder {
  id: string
  display_code: string | null
  status: string
  total_cents: number
  created_at: string
  customer_name: string | null
  pax: number | null
  table_id: string | null
  table_label: string | null
  /** `dine_in` or `self_pickup` (pending counter take-away). */
  delivery_type?: string | null
  source?: string | null
  /** Dishes on the ticket, newest fetch from the embedded select. */
  items?: PosOrderItem[] | null
}

/**
 * What a cashier is collecting: one take-away ticket or every unpaid order at
 * a table. The table UI groups the money; the ledger stays per order.
 */
export interface PosSettleTarget {
  kind: 'order' | 'table'
  /** Order id for `order`, table id for `table`. */
  id: string
  label: string
  context: string
  amountCents: number
  orderCount: number
  /**
   * Exactly which tickets the cashier is confirming. The table settle RPC
   * rejects the call when the live pending set differs, so a round added while
   * the modal is open can never be charged unseen.
   */
  orderIds: string[]
}

/**
 * Why a table cannot close. Only an unsettled bill blocks closing: the POS has
 * no control that moves an order through the kitchen, so requiring `ready`
 * stranded every pay-now table at `paid` with no way to finish (see migration
 * 061).
 */
export type TableCloseBlockReason = 'empty' | 'unpaid'

/** Derived view of one table plus its open orders. */
export interface TableSummary {
  table: RestaurantTable
  orders: PosOpenOrder[]
  isOccupied: boolean
  openOrderCount: number
  totalCents: number
  pax: number | null
  hasUnpaid: boolean
  canClose: boolean
  closeBlockReason: TableCloseBlockReason | null
  oldestCreatedAt: string | null
  /**
   * Paid tickets the kitchen has not marked `ready`. Closing completes them
   * (`reason: 'table_closed'`), so the confirm dialog warns about them.
   */
  kitchenActiveOrderCount: number
}

export interface TableOrderSuccess {
  order_id: string
  order_number: string
  display_code: string | null
  total_cents: number
  table_label: string
  pax: number
}
