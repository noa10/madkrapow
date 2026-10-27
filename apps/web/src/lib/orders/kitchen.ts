/**
 * Which orders belong on the kitchen board.
 *
 * Table-QR dine-in orders are created `pending` (the diner pays at the
 * counter) but the kitchen must start cooking immediately, so pending
 * *dine-in* tickets are active. Pending delivery/pickup orders are abandoned
 * web checkouts and must stay off the board.
 *
 * Shared by the kitchen page, its data hook and the tests so the fetch filter
 * and the client filter cannot drift.
 */

export const KITCHEN_ACTIVE_STATUSES = [
  'paid',
  'accepted',
  'preparing',
  'ready',
] as const

export function isKitchenActive(order: {
  status: string
  delivery_type?: string | null
}): boolean {
  if ((KITCHEN_ACTIVE_STATUSES as readonly string[]).includes(order.status)) {
    return true
  }
  return order.status === 'pending' && order.delivery_type === 'dine_in'
}

/**
 * PostgREST `or=` expression matching {@link isKitchenActive}, so the initial
 * fetch cannot be crowded out by completed orders or abandoned checkouts.
 */
export const KITCHEN_QUEUE_OR_FILTER =
  'status.in.(paid,accepted,preparing,ready),and(status.eq.pending,delivery_type.eq.dine_in)'
