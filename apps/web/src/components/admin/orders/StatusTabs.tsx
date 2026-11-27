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
    <div role="tablist" aria-label="Order status" className="grid grid-cols-4 gap-1 sm:gap-2">
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
              // Four equal columns so the whole row reads as one tab bar. The
              // count sits under the label on narrow phones and beside it from
              // `sm` up, which keeps every tab inside its quarter.
              "flex w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-xs font-medium transition-all duration-200 sm:flex-row sm:gap-1.5 sm:px-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            )}
          >
            <span className="max-w-full truncate">{tab.label}</span>
            {typeof count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
                  isActive ? "bg-white/20" : "bg-white/10"
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
