"use client"

import { cn } from "@/lib/utils"
import type { OrderTab } from "@/types/orders"

const TABS: { value: OrderTab; label: string }[] = [
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "upcoming", label: "Upcoming" },
  { value: "history", label: "History" },
]

interface StatusTabsProps {
  activeTab: OrderTab
  onTabChange: (tab: OrderTab) => void
  counts: Record<OrderTab, number | null>
}

export function StatusTabs({ activeTab, onTabChange, counts }: StatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Order status"
      className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
    >
      {TABS.map((tab) => {
        const count = counts[tab.value]
        const isActive = activeTab === tab.value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            )}
          >
            {tab.label}
            {typeof count === "number" && ` (${count})`}
          </button>
        )
      })}
    </div>
  )
}
