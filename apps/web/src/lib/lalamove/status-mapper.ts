import type { LalamoveOrderStatus, ShipmentDispatchStatus } from './types'

/**
 * Map Lalamove v3 order status to internal shipment dispatch status.
 */
const V3_TO_DISPATCH: Record<LalamoveOrderStatus, ShipmentDispatchStatus> = {
  ASSIGNING_DRIVER: 'driver_pending',
  ON_GOING: 'driver_assigned',
  PICKED_UP: 'in_transit',
  COMPLETED: 'delivered',
  CANCELED: 'cancelled',
  REJECTED: 'manual_review',
  EXPIRED: 'failed',
}

/**
 * Map internal dispatch status to orders.status (food-order lifecycle).
 *
 * Only returns a value when the order lifecycle truly transitions.
 * Most dispatch statuses do NOT change the food order status.
 */
const DISPATCH_TO_ORDER_STATUS: Partial<Record<ShipmentDispatchStatus, string>> = {
  in_transit: 'picked_up',
  delivered: 'delivered',
}

/**
 * Map Lalamove v3 status to internal dispatch status.
 */
export function mapV3StatusToDispatch(status: LalamoveOrderStatus): ShipmentDispatchStatus {
  return V3_TO_DISPATCH[status] ?? 'manual_review'
}

/**
 * Map dispatch status to the corresponding orders.status update.
 *
 * Returns null if no order status change is needed.
 */
export function mapDispatchToOrderStatus(dispatchStatus: ShipmentDispatchStatus): string | null {
  return DISPATCH_TO_ORDER_STATUS[dispatchStatus] ?? null
}

/**
 * Check if a dispatch status represents a terminal state (no further updates expected).
 */
export function isTerminalStatus(status: ShipmentDispatchStatus): boolean {
  return ['delivered', 'cancelled', 'failed'].includes(status)
}

/**
 * Check if a status transition is valid (prevents out-of-order webhook processing).
 *
 * Terminal states cannot be reverted. Allowed forward transitions:
 * quoted → driver_pending → driver_assigned → in_transit → delivered
 * Any non-terminal → failed / cancelled / manual_review
 */
export function isValidStatusTransition(
  from: ShipmentDispatchStatus,
  to: ShipmentDispatchStatus
): boolean {
  // Can't revert from terminal states (except manual_review can retry)
  if (from === 'delivered' || from === 'failed' || from === 'cancelled') {
    return false
  }

  // manual_review can retry to driver_pending
  if (from === 'manual_review' && to === 'driver_pending') {
    return true
  }

  // Any state can go to failed, cancelled, or manual_review
  if (['failed', 'cancelled', 'manual_review'].includes(to)) {
    return true
  }

  // Normal forward progression
  const order: ShipmentDispatchStatus[] = [
    'quoted',
    'driver_pending',
    'driver_assigned',
    'in_transit',
    'delivered',
  ]

  const fromIdx = order.indexOf(from)
  const toIdx = order.indexOf(to)

  if (fromIdx === -1 || toIdx === -1) return false

  // Allow any strictly-forward step. Lalamove fires concurrent webhooks within
  // a few seconds (ON_GOING, PICKED_UP, COMPLETED), so a single handler can
  // snapshot an older shipment state and race a later webhook. Strict +1
  // stepping drops those and leaves orders stuck mid-lifecycle.
  return toIdx > fromIdx
}
