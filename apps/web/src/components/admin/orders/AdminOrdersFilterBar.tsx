"use client"

import { RefreshCw, Wifi, WifiOff, Globe, MessageCircle, MessageSquare, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import type { OrderTab, OrderSource } from "@/types/orders"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"

interface AdminOrdersFilterBarProps {
  activeTab: OrderTab
  onTabChange: (tab: OrderTab) => void
  onRefresh: () => void
  orderCount: number
  realtimeConnected?: boolean
  sourceFilter?: "all" | OrderSource
  onSourceFilterChange?: (source: "all" | OrderSource) => void
}

const TABS: { value: OrderTab; label: string }[] = [
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "upcoming", label: "Upcoming" },
  { value: "history", label: "History" },
]

const SOURCE_OPTIONS: { value: "all" | OrderSource; label: string; icon: React.ReactNode }[] = [
  { value: "all", label: "All Sources", icon: null },
  { value: "web", label: "Web", icon: <Globe className="h-3.5 w-3.5" /> },
  { value: "telegram", label: "Telegram", icon: <MessageCircle className="h-3.5 w-3.5" /> },
  { value: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { value: "mobile", label: "Mobile", icon: <Smartphone className="h-3.5 w-3.5" /> },
]

export function AdminOrdersFilterBar({
  activeTab,
  onTabChange,
  onRefresh,
  orderCount,
  realtimeConnected = true,
  sourceFilter = "all",
  onSourceFilterChange,
}: AdminOrdersFilterBarProps) {
  return (
    <div className="space-y-4">
      {/* Status tabs with realtime indicator and refresh */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200",
                activeTab === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onSourceFilterChange && (
            <Select value={sourceFilter} onValueChange={(v) => onSourceFilterChange(v as "all" | OrderSource)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            onClick={onRefresh}
            className="rounded-lg p-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
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

      {/* Count */}
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">{orderCount}</span>
        <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">
          {orderCount === 1 ? "order" : "orders"}
        </span>
      </div>
    </div>
  )
}
