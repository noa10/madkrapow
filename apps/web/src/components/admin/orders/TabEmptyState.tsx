"use client"

import { ChefHat, PackageCheck, CalendarClock, History } from "lucide-react"
import type { OrderTab } from "@/types/orders"

const MESSAGES: Record<OrderTab, { icon: typeof ChefHat; title: string; body: string }> = {
  preparing: {
    icon: ChefHat,
    title: "No orders being prepared",
    body: "ASAP orders that are pending, paid, or being prepared will appear here.",
  },
  ready: {
    icon: PackageCheck,
    title: "No orders ready",
    body: "ASAP orders marked as ready for pickup or delivery will appear here.",
  },
  upcoming: {
    icon: CalendarClock,
    title: "No upcoming orders",
    body: "Bulk and scheduled orders that are not yet completed will appear here.",
  },
  history: {
    icon: History,
    title: "No orders for this period",
    body: "Completed and cancelled orders for the selected date range will appear here.",
  },
}

interface TabEmptyStateProps {
  tab: OrderTab
}

export function TabEmptyState({ tab }: TabEmptyStateProps) {
  const { icon: Icon, title, body } = MESSAGES[tab]

  return (
    <div className="rounded-xl border bg-card p-12 text-center">
      <Icon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  )
}
