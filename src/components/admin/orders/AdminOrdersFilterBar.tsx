"use client"

import { Layers, List, Table2, Wifi, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"

type ViewMode = "cards" | "list" | "table"

interface AdminOrdersFilterBarProps {
  activeFilter: string
  onFilterChange: (value: string) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  orderCount: number
  realtimeConnected?: boolean
}

const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "asap", label: "ASAP" },
  { value: "scheduled", label: "Scheduled" },
  { value: "pickup", label: "Pickup" },
  { value: "bulk", label: "Bulk" },
  { value: "dispatch_failed", label: "Dispatch Failed" },
]

const viewModes: { value: ViewMode; label: string; icon: typeof Layers }[] = [
  { value: "cards", label: "Cards", icon: Layers },
  { value: "list", label: "List", icon: List },
  { value: "table", label: "Table", icon: Table2 },
]

export function AdminOrdersFilterBar({
  activeFilter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  orderCount,
  realtimeConnected = true,
}: AdminOrdersFilterBarProps) {
  return (
    <div className="space-y-4">
      {/* Filter tabs with realtime indicator */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onFilterChange(tab.value)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                activeFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {realtimeConnected ? (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Wifi className="h-3 w-3" />
              <span className="hidden sm:inline">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              <span className="hidden sm:inline">Disconnected</span>
            </div>
          )}
        </div>
      </div>

      {/* Count and view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{orderCount}</span>
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
                  ? "bg-primary/15 text-primary"
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
