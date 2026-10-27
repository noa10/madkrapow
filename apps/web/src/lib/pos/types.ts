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
}

export type TableCloseBlockReason = 'empty' | 'unpaid' | 'not_ready'

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
}

export interface TableOrderSuccess {
  order_id: string
  order_number: string
  display_code: string | null
  total_cents: number
  table_label: string
  pax: number
}
