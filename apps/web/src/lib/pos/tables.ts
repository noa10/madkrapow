/**
 * Pure helpers for the dine-in table board and table QR links.
 *
 * Everything here is framework-free and unit-tested; the POS components and
 * route handlers only compose these functions.
 */

import {
  OPEN_DINE_IN_STATUSES,
  type PosOpenOrder,
  type PosOrderItem,
  type PosSettleTarget,
  type RestaurantTable,
  type TableCloseBlockReason,
  type TableSummary,
} from './types'

export const MIN_PAX = 1
export const MAX_PAX = 50

/** Absolute URL encoded in a table's QR code. */
export function tableQrUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/t/${encodeURIComponent(token)}`
}

/** True when an order status still occupies a table. */
export function isOpenDineInStatus(status: string): boolean {
  return (OPEN_DINE_IN_STATUSES as readonly string[]).includes(status)
}

/**
 * Validate a pax value from an untrusted source.
 * Returns the integer, or null when it is out of range / not a number.
 */
export function parsePax(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN
  if (!Number.isInteger(n) || n < MIN_PAX || n > MAX_PAX) return null
  return n
}

/**
 * Derive the table board state from a table and its open orders.
 *
 * Closing follows the canonical order machine: every open order must already
 * be `ready`, which is the only status that may move to `picked_up`.
 */
export function summarizeTable(
  table: RestaurantTable,
  orders: readonly PosOpenOrder[]
): TableSummary {
  const open = orders.filter((order) => isOpenDineInStatus(order.status))
  const totalCents = open.reduce((sum, order) => sum + order.total_cents, 0)
  const hasUnpaid = open.some((order) => order.status === 'pending')

  // Multiple rounds at one table repeat the same party size; max avoids
  // multiplying it by the number of orders.
  const pax = open.reduce<number | null>(
    (max, order) =>
      order.pax != null && (max == null || order.pax > max) ? order.pax : max,
    null
  )

  const oldestCreatedAt =
    open.length === 0
      ? null
      : open.reduce(
          (oldest, order) =>
            new Date(order.created_at) < new Date(oldest)
              ? order.created_at
              : oldest,
          open[0].created_at
        )

  let closeBlockReason: TableCloseBlockReason | null = null
  if (open.length === 0) {
    closeBlockReason = 'empty'
  } else if (hasUnpaid) {
    closeBlockReason = 'unpaid'
  } else if (open.some((order) => order.status !== 'ready')) {
    closeBlockReason = 'not_ready'
  }

  return {
    table,
    orders: open,
    isOccupied: open.length > 0,
    openOrderCount: open.length,
    totalCents,
    pax,
    hasUnpaid,
    canClose: closeBlockReason === null,
    closeBlockReason,
    oldestCreatedAt,
  }
}

/** Human copy for the close-table blocker. */
export function closeBlockedMessage(
  reason: TableCloseBlockReason | null
): string | null {
  switch (reason) {
    case 'empty':
      return 'This table has no open orders.'
    case 'unpaid':
      return 'Collect payment for the unpaid order before closing the table.'
    case 'not_ready':
      return 'The kitchen must mark every order ready before the table can close.'
    default:
      return null
  }
}

/** Label for the POS order-type toggle. */
export function posOrderTypeLabel(type: 'dine_in' | 'take_away'): string {
  return type === 'dine_in' ? 'Dine-in' : 'Take-away'
}

/** Pending dine-in orders for a table, de-duplicated by id (realtime can race). */
export function unpaidOrdersForTable(
  orders: readonly PosOpenOrder[]
): PosOpenOrder[] {
  const seen = new Set<string>()
  const unpaid: PosOpenOrder[] = []
  for (const order of orders) {
    if (order.status !== 'pending') continue
    // Mirror the settle RPC's predicate so the button total always equals what
    // the database will mark paid.
    if (order.delivery_type !== 'dine_in') continue
    if (seen.has(order.id)) continue
    seen.add(order.id)
    unpaid.push(order)
  }
  return unpaid
}

/**
 * One collect action for every unpaid order at a table.
 *
 * The card and the sale panel both use this so the grouped total, the count and
 * the button label can never disagree. Returns null when nothing is unpaid.
 */
export function buildTableSettleTargetFromOrders(
  table: Pick<RestaurantTable, 'id' | 'label'>,
  orders: readonly PosOpenOrder[]
): PosSettleTarget | null {
  const unpaid = unpaidOrdersForTable(orders)
  if (unpaid.length === 0) return null
  const amountCents = unpaid.reduce((sum, order) => sum + order.total_cents, 0)
  return {
    kind: 'table',
    id: table.id,
    label: `Table ${table.label}`,
    context: `${unpaid.length} unpaid order${unpaid.length === 1 ? '' : 's'}`,
    amountCents,
    orderCount: unpaid.length,
    orderIds: unpaid.map((order) => order.id),
  }
}

/** Grouped collect target for a table summary. */
export function buildTableSettleTarget(
  summary: TableSummary
): PosSettleTarget | null {
  return buildTableSettleTargetFromOrders(summary.table, summary.orders)
}

/** Collect target for a single ticket (take-away, or a direct order settle). */
export function buildOrderSettleTarget(order: PosOpenOrder): PosSettleTarget {
  return {
    kind: 'order',
    id: order.id,
    label: order.display_code ?? 'Order',
    context: order.customer_name
      ? `Take-away · ${order.customer_name}`
      : 'Take-away',
    amountCents: order.total_cents,
    orderCount: 1,
    orderIds: [order.id],
  }
}

/**
 * PostgREST returns the embedded dishes under the relationship name
 * (`order_items`); the UI reads `items`. Normalise once at the data boundary.
 */
export type PosOpenOrderRow = Omit<PosOpenOrder, 'items'> & {
  order_items?: PosOrderItem[] | null
}

export function normaliseOpenOrder(row: PosOpenOrderRow): PosOpenOrder {
  const { order_items, ...order } = row
  return { ...order, items: order_items ?? [] }
}
