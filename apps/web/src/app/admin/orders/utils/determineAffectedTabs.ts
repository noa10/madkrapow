import type { Order, OrderTab } from "@/types/orders"
import { ADMIN_TAB_FILTERS } from "@/lib/orders/tab-filters"
import { ADMIN_TAB_STATUSES, parseOrderStatus } from "@/lib/orders/status"

export function determineAffectedTabs(order: Order): OrderTab[] {
  const tabs: OrderTab[] = []
  const { status, fulfillment_type, order_kind } = order
  const parsed = parseOrderStatus(status)
  const known = parsed !== "unknown"

  // The status lists below come from ADMIN_TAB_FILTERS — the same source the tab
  // queries and counters consume — so this client-side mirror of those filters
  // cannot drift from them. (The callers union these with the order's previous
  // tabs, so a tab the order has just left is still invalidated.)

  // Preparing: pre-kitchen / kitchen statuses + asap
  if (known && ADMIN_TAB_STATUSES.preparing.includes(parsed) && fulfillment_type === "asap") {
    tabs.push("preparing")
  }

  // Ready: ready + asap
  if (known && ADMIN_TAB_STATUSES.ready.includes(parsed) && fulfillment_type === "asap") {
    tabs.push("ready")
  }

  // Upcoming: bulk OR scheduled, excluding the statuses the tab filter excludes
  const upcoming = ADMIN_TAB_FILTERS.upcoming
  if (
    upcoming.kind === "bulk-or-scheduled" &&
    !(known && upcoming.excludeStatuses.includes(parsed)) &&
    (upcoming.orderKinds.includes(order_kind) ||
      fulfillment_type === upcoming.fulfillmentType)
  ) {
    tabs.push("upcoming")
  }

  // History: terminal-ish statuses (picked_up, delivered, cancelled).
  // ADMIN_TAB_STATUSES.history covers exactly these three.
  if (known && ADMIN_TAB_STATUSES.history.includes(parsed)) {
    tabs.push("history")
  }

  return tabs
}
