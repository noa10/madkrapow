"use client"

import { ArrowUpDown, RefreshCw, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import type { OrderSource } from "@/types/orders"

const SOURCE_OPTIONS: { value: "all" | OrderSource; label: string }[] = [
  { value: "all", label: "All Sources" },
  { value: "web", label: "Web" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "mobile", label: "Mobile" },
  { value: "counter", label: "Counter" },
  { value: "grabfood", label: "GrabFood" },
  { value: "foodpanda", label: "Foodpanda" },
]

interface OrdersToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  sourceFilter: "all" | OrderSource
  onSourceFilterChange: (v: "all" | OrderSource) => void
  onRefresh: () => void
  realtimeConnected: boolean
  sortDirection: "asc" | "desc"
  onToggleSort: () => void
}

export function OrdersToolbar({
  search,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  onRefresh,
  realtimeConnected,
  sortDirection,
  onToggleSort,
}: OrdersToolbarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search order #, name, phone"
          aria-label="Search orders"
          className="h-9 pl-9 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <Select
          value={sourceFilter}
          onValueChange={(v) => onSourceFilterChange(v as "all" | OrderSource)}
        >
          <SelectTrigger className="h-9 w-[132px] text-xs">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={onToggleSort}
          aria-label={`Sort by ${sortDirection === "desc" ? "oldest" : "newest"} first`}
          title={sortDirection === "desc" ? "Newest first" : "Oldest first"}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortDirection === "desc" ? "Newest" : "Oldest"}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh orders"
          title="Refresh orders"
          className="shrink-0 rounded-md border border-input bg-transparent p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>

        <span
          className="flex shrink-0 items-center gap-1.5 pl-1 text-xs text-muted-foreground"
          title={realtimeConnected ? "Realtime connected" : "Realtime disconnected"}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 rounded-full",
              realtimeConnected ? "animate-pulse bg-emerald-400" : "bg-muted-foreground/50"
            )}
          />
          {realtimeConnected ? "Live" : "Disconnected"}
        </span>
      </div>
    </div>
  )
}
