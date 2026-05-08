"use client"

import { useState } from "react"
import { Calendar, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

export type DateFilterValue = "today" | "weekly" | "monthly" | "custom"

export interface CustomDateRange {
  start: string
  end: string
}

interface AdminOrdersDateFilterBarProps {
  activeFilter: DateFilterValue
  onFilterChange: (value: DateFilterValue) => void
  customRange: CustomDateRange
  onCustomRangeChange: (range: CustomDateRange) => void
  onApplyCustomRange: () => void
  visible?: boolean
  fallbackFilter?: DateFilterValue
}

const DATE_FILTER_TABS: { value: DateFilterValue; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
]

export function AdminOrdersDateFilterBar({
  activeFilter,
  onFilterChange,
  customRange,
  onCustomRangeChange,
  onApplyCustomRange,
  visible = true,
  fallbackFilter = "today",
}: AdminOrdersDateFilterBarProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  if (!visible) return null

  const handleFilterClick = (value: DateFilterValue) => {
    if (value === "custom") {
      setShowCustomPicker(true)
    } else {
      setShowCustomPicker(false)
      onFilterChange(value)
    }
  }

  const handleCloseCustom = () => {
    setShowCustomPicker(false)
    if (activeFilter === "custom") {
      onFilterChange(fallbackFilter)
    }
  }

  const todayStr = new Date().toISOString().split("T")[0]

  return (
    <div className="space-y-3">
      {/* Date filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        {DATE_FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleFilterClick(tab.value)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 flex items-center gap-1.5",
              activeFilter === tab.value
                ? "bg-gold/15 text-gold border border-gold/20"
                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-transparent"
            )}
          >
            {tab.value === "custom" && <Calendar className="h-3 w-3" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Custom date picker */}
      {showCustomPicker && (
        <div className="flex items-end gap-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
          <div className="flex-1 space-y-1.5 min-w-0">
            <label className="text-[11px] text-muted-foreground font-medium">Start Date</label>
            <Input
              type="date"
              value={customRange.start}
              max={todayStr}
              onChange={(e) =>
                onCustomRangeChange({ ...customRange, start: e.target.value })
              }
              className="h-9 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <label className="text-[11px] text-muted-foreground font-medium">End Date</label>
            <Input
              type="date"
              value={customRange.end}
              max={todayStr}
              onChange={(e) =>
                onCustomRangeChange({ ...customRange, end: e.target.value })
              }
              className="h-9 text-xs"
            />
          </div>
          <button
            onClick={onApplyCustomRange}
            disabled={!customRange.start || !customRange.end}
            className={cn(
              "shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition-all",
              !customRange.start || !customRange.end
                ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                : "bg-gold/15 text-gold hover:bg-gold/25"
            )}
          >
            Apply
          </button>
          <button
            onClick={handleCloseCustom}
            className="shrink-0 rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
