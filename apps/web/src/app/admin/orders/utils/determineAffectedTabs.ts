import type { Order, OrderTab } from "@/types/orders"

export function determineAffectedTabs(order: Order): OrderTab[] {
  const tabs: OrderTab[] = []
  const { status, fulfillment_type, order_kind } = order

  // Preparing: pending, paid, preparing + asap
  if (
    (status === "pending" || status === "paid" || status === "preparing") &&
    fulfillment_type === "asap"
  ) {
    tabs.push("preparing")
  }

  // Ready: ready + asap
  if (status === "ready" && fulfillment_type === "asap") {
    tabs.push("ready")
  }

  // Upcoming: bulk OR scheduled, excluding terminal statuses
  if (
    !["picked_up", "delivered", "cancelled"].includes(status) &&
    (order_kind === "bulk" || fulfillment_type === "schedule")
  ) {
    tabs.push("upcoming")
  }

  // History: picked_up, delivered, cancelled
  if (["picked_up", "delivered", "cancelled"].includes(status)) {
    tabs.push("history")
  }

  return tabs
}
