"use client"

import { Layers, List, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"

type ViewMode = "cards" | "list" | "table"

interface OrdersFilterBarProps {
  activeFilter: string
  onFilterChange: (value: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  orderCount: number
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "preparing", label: "Preparing" },
  { value: "picked_up", label: "On the Way" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
]

const viewModes: { value: ViewMode; label: string; icon: typeof Layers }[] = [
  { value: "cards", label: "Cards", icon: Layers },
  { value: "list", label: "List", icon: List },
  { value: "table", label: "Table", icon: Table2 },
]

export function OrdersFilterBar({
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  orderCount,
}: OrdersFilterBarProps) {
  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
              activeFilter === filter.value
                ? "bg-gold/15 text-gold"
                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Bottom bar with count and view mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-muted-foreground">{orderCount}</span>
          <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">
            {orderCount === 1 ? "order" : "orders"}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {viewModes.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onViewModeChange(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-all",
                viewMode === value
                  ? "bg-gold/15 text-gold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={value}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
