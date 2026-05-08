"use client"

import { useState, useEffect, useRef } from "react"
import { Calendar, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

type PresetKey = "today" | "yesterday" | "last7" | "thisMonth" | "custom"

export interface DateRange {
  from: string
  to: string
  label: string
  key: PresetKey
}

interface DateRangePickerProps {
  activeRange?: DateRange | null
  onRangeChange: (range: DateRange) => void
  visible?: boolean
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "thisMonth", label: "This month" },
  { key: "custom", label: "Custom" },
]

function computeRange(key: PresetKey, customFrom?: string, customTo?: string): DateRange {
  const now = new Date()
  const todayStr = now.toISOString().split("T")[0]

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()

  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), label: "Today", key }
    case "yesterday": {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday", key }
    }
    case "last7": {
      const s = new Date(now)
      s.setDate(s.getDate() - 6)
      return { from: startOfDay(s), to: endOfDay(now), label: "Last 7 days", key }
    }
    case "thisMonth":
      return {
        from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: endOfDay(now),
        label: "This month",
        key,
      }
    case "custom":
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : "",
        to: customTo ? endOfDay(new Date(customTo)) : "",
        label: customFrom && customTo ? `${customFrom} — ${customTo}` : "Custom",
        key,
      }
  }
}

export function DateRangePicker({ activeRange, onRangeChange, visible = true }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>("today")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const panelRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", handleClickOutside)
    return () => document.removeEventListener("pointerdown", handleClickOutside)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleEsc)
    return () => document.removeEventListener("keydown", handleEsc)
  }, [open])

  if (!visible) return null

  const handlePresetClick = (key: PresetKey) => {
    setSelectedPreset(key)
    if (key !== "custom") {
      const range = computeRange(key)
      onRangeChange(range)
      setOpen(false)
    }
  }

  const handleApplyCustom = () => {
    if (!customFrom || !customTo) return
    const range = computeRange("custom", customFrom, customTo)
    onRangeChange(range)
    setOpen(false)
  }

  const todayStr = new Date().toISOString().split("T")[0]
  const displayLabel = activeRange?.label || "Today"

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all",
          "border border-white/8 bg-white/5 hover:bg-white/10",
          "text-foreground"
        )}
      >
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{displayLabel}</span>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Panel — bottom sheet on mobile, dropdown on desktop */}
      {open && (
        <>
          {/* Mobile overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            className={cn(
              "z-[60] bg-card border border-white/10 rounded-xl shadow-2xl shadow-black/40",
              "lg:absolute lg:left-0 lg:top-full lg:mt-2 lg:w-80",
              "fixed inset-x-0 bottom-0 rounded-b-none max-h-[80vh] overflow-y-auto p-4 lg:p-0"
            )}
            role="dialog"
            aria-label="Select date range"
          >
            {/* Presets */}
            <div className="flex flex-wrap gap-2 lg:p-3">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePresetClick(p.key)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium transition-all",
                    selectedPreset === p.key
                      ? "bg-gold/15 text-gold border border-gold/20"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-transparent"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom range inputs */}
            {selectedPreset === "custom" && (
              <div className="mt-3 space-y-3 lg:p-3 lg:pt-0">
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <label className="text-[11px] text-muted-foreground font-medium">Start</label>
                    <Input
                      type="date"
                      value={customFrom}
                      max={customTo || todayStr}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <label className="text-[11px] text-muted-foreground font-medium">End</label>
                    <Input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      max={todayStr}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCustom}
                    disabled={!customFrom || !customTo}
                    className={cn(
                      "rounded-lg px-4 py-2 text-xs font-medium transition-all",
                      !customFrom || !customTo
                        ? "bg-white/5 text-muted-foreground cursor-not-allowed"
                        : "bg-gold/15 text-gold hover:bg-gold/25"
                    )}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* Drag handle for mobile bottom sheet */}
            <div className="lg:hidden flex justify-center pt-2">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
