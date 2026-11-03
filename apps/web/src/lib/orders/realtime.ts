/**
 * Merge a realtime `orders` row into a cached order.
 *
 * `postgres_changes` payloads contain only the `orders` columns. The merchant
 * views show `channel_orders.external_order_number` (the Grab short number)
 * instead of the local `display_code`, so a blind replace would drop the
 * embedded channel identity and flash the local code until the next refetch.
 * Spreading keeps the cached channel rows; an incoming row that carries the
 * field still wins.
 */

export interface ChannelIdentity {
  channel: string
  external_order_number: string | null
}

export function mergeRealtimeOrder<T extends object>(
  current: T | undefined,
  incoming: Partial<T>,
): T {
  if (!current) return incoming as T
  return { ...current, ...incoming }
}
