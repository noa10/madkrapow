/**
 * Which orders belong on the kitchen board.
 *
 * Table-QR dine-in orders can be created `pending` (the diner chose to pay at
 * the counter) and are cooked immediately. POS Pay-later is no longer created
 * — a counter sale is always paid — but pending counter tickets from before
 * that change stay active until they are settled. Pending web delivery/pickup
 * orders are abandoned checkouts and must stay off the board.
 *
 * A counter take-away is marked `delivered` as soon as its payment succeeds,
 * because the customer collects it at the counter. It still has to be cooked,
 * so it stays on the board while `kitchen_status` is `paid` or `preparing`;
 * `ready` removes it. Every other delivered order is finished.
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

/** Kitchen progress of a counter take-away that completed at payment. */
export const KITCHEN_COUNTER_PICKUP_STATUSES = ['paid', 'preparing'] as const

export function isKitchenActive(order: {
  status: string
  delivery_type?: string | null
  source?: string | null
  kitchen_status?: string | null
}): boolean {
  if (order.status === 'delivered') {
    // Counter take-away is marked delivered the moment it is paid, but the
    // food still has to be cooked. It stays on the board until the kitchen
    // marks it ready; every other delivered order is finished.
    return (
      order.source === 'counter' &&
      order.delivery_type === 'self_pickup' &&
      (KITCHEN_COUNTER_PICKUP_STATUSES as readonly string[]).includes(
        order.kitchen_status ?? ''
      )
    )
  }
  if ((KITCHEN_ACTIVE_STATUSES as readonly string[]).includes(order.status)) {
    return true
  }
  if (order.status !== 'pending') return false
  return order.delivery_type === 'dine_in' || order.source === 'counter'
}

/**
 * PostgREST `or=` expression matching {@link isKitchenActive}, so the initial
 * fetch cannot be crowded out by completed orders or abandoned checkouts.
 */
export const KITCHEN_QUEUE_OR_FILTER =
  'status.in.(paid,accepted,preparing,ready),and(status.eq.pending,delivery_type.eq.dine_in),and(status.eq.pending,source.eq.counter),and(status.eq.delivered,source.eq.counter,delivery_type.eq.self_pickup,kitchen_status.in.(paid,preparing))'
