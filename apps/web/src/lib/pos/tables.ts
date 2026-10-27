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
 * Closing is gated on the bill, not the kitchen: the POS is where a cashier
 * collects and closes, and it has no control that moves a ticket through
 * paid → preparing → ready. Requiring `ready` therefore stranded every
 * pay-now table (see migration 061). Unpaid tickets still block.
 */
export function summarizeTable(
  table: RestaurantTable,
  orders: readonly PosOpenOrder[]
): TableSummary {
  const open = orders.filter((order) => isOpenDineInStatus(order.status))
  const totalCents = open.reduce((sum, order) => sum + order.total_cents, 0)
  const hasUnpaid = open.some((order) => order.status === 'pending')
  // Paid tickets the kitchen has not finished. `pending` is excluded: it blocks
  // closing on its own, and the warning promises the tickets will be marked
  // served, which is only true of the ones already paid.
  const kitchenActiveOrderCount = open.filter(
    (order) => order.status !== 'ready' && order.status !== 'pending'
  ).length

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
    kitchenActiveOrderCount,
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
    default:
      return null
  }
}

/**
 * Warning for the close confirmation when the kitchen has not finished.
 *
 * Closing completes those tickets, so the cashier is told before confirming
 * rather than discovering it afterwards.
 */
export function closeTableWarning(kitchenActiveOrderCount: number): string | null {
  if (kitchenActiveOrderCount <= 0) return null
  const plural = kitchenActiveOrderCount === 1 ? 'order is' : 'orders are'
  return `${kitchenActiveOrderCount} ${plural} still in the kitchen. Closing marks ${
    kitchenActiveOrderCount === 1 ? 'it' : 'them'
  } served and frees the table.`
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
