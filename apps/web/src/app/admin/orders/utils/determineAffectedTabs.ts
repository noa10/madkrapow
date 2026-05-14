import type { Order, OrderTab } from "@/types/orders"
import {
  ADMIN_TAB_STATUSES,
  TERMINAL_STATUSES,
  parseOrderStatus,
} from "@/lib/orders/status"

export function determineAffectedTabs(order: Order): OrderTab[] {
  const tabs: OrderTab[] = []
  const { status, fulfillment_type, order_kind } = order
  const parsed = parseOrderStatus(status)

  // Preparing: pre-kitchen / kitchen statuses + asap
  if (
    parsed !== "unknown" &&
    ADMIN_TAB_STATUSES.preparing.includes(parsed) &&
    fulfillment_type === "asap"
  ) {
    tabs.push("preparing")
  }

  // Ready: ready + asap
  if (parsed === "ready" && fulfillment_type === "asap") {
    tabs.push("ready")
  }

  // Upcoming: bulk OR scheduled, excluding terminal statuses
  if (
    !(parsed !== "unknown" && TERMINAL_STATUSES.has(parsed)) &&
    (order_kind === "bulk" || fulfillment_type === "schedule")
  ) {
    tabs.push("upcoming")
  }

  // History: terminal-ish statuses (picked_up, delivered, cancelled).
  // ADMIN_TAB_STATUSES.history covers exactly these three.
  if (parsed !== "unknown" && ADMIN_TAB_STATUSES.history.includes(parsed)) {
    tabs.push("history")
  }

  return tabs
}
