"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, ShieldAlert, ArrowUpDown } from "lucide-react"
import { useRoleGuard } from "@/hooks/use-role-guard"
import { NewOrderAlert } from "@/components/admin/NewOrderAlert"
import { AdminOrdersFilterBar } from "@/components/admin/orders/AdminOrdersFilterBar"
import { OrderRowCard } from "@/components/admin/orders/OrderRowCard"
import { DateRangePicker, type DateRange as PickerDateRange } from "@/components/admin/orders/DateRangePicker"
import { AdminOrdersSalesSummary } from "@/components/admin/orders/AdminOrdersSalesSummary"
import { HistoryTabSummary } from "@/components/admin/orders/HistoryTabSummary"
import { TabEmptyState } from "@/components/admin/orders/TabEmptyState"
import { TabSkeleton } from "@/components/admin/orders/TabSkeleton"
import { useAdminOrdersStore } from "@/stores/adminOrdersStore"
import { useOrderTabQuery } from "./hooks/useOrderTabQuery"
import { useRealtimeOrderUpdates } from "./hooks/useRealtimeOrderUpdates"
import { useTodayAsapOrdersQuery } from "./hooks/useTodayAsapOrdersQuery"
import { toDateRange } from "./utils/toDateRange"
import { cn } from "@/lib/utils"
import type { OrderTab } from "@/types/orders"
import type { Order } from "@/types/orders"

type SortDirection = "desc" | "asc"

export default function AdminOrdersPage() {
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard(["admin", "manager", "cashier"])

  const activeTab = useAdminOrdersStore((s) => s.activeTab)
  const caches = useAdminOrdersStore((s) => s.caches)
  const activeDateFilter = useAdminOrdersStore((s) => s.activeDateFilter)
  const customDateRange = useAdminOrdersStore((s) => s.customDateRange)
  const setActiveTab = useAdminOrdersStore((s) => s.setActiveTab)
  const setDateRange = useAdminOrdersStore((s) => s.setDateRange)
  const setActiveDateFilter = useAdminOrdersStore((s) => s.setActiveDateFilter)
  const setCustomDateRange = useAdminOrdersStore((s) => s.setCustomDateRange)
  const invalidateAllTabs = useAdminOrdersStore((s) => s.invalidateAllTabs)

  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [activePickerRange, setActivePickerRange] = useState<PickerDateRange | null>(null)

  // Initialize date range to Today on mount
  useEffect(() => {
    const range = toDateRange("today", { start: "", end: "" })
    if (range) {
      setDateRange(range)
    }
  }, [setDateRange])

  // Tab data fetching
  useOrderTabQuery(activeTab)

  // Realtime subscriptions
  const { realtimeConnected } = useRealtimeOrderUpdates()

  // Global "Today's Sales" summary (ASAP orders today)
  const { orders: todayAsapOrders } = useTodayAsapOrdersQuery()

  const { summaryLabel, summaryTotalCents } = useMemo(() => {
    const totalCents = todayAsapOrders.reduce(
      (sum, o) => sum + o.total_cents + o.delivery_fee_cents,
      0
    )
    return { summaryLabel: "Total Sales Today", summaryTotalCents: totalCents }
  }, [todayAsapOrders])

  const activeCache = caches[activeTab]
  const activeOrders = activeCache.orders
  const isLoading = activeCache.isLoading
  const error = activeCache.error

  // Sort orders
  const sortedOrders = useMemo(() => {
    return [...activeOrders].sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDirection === "desc" ? -diff : diff
    })
  }, [activeOrders, sortDirection])

  const handleTabChange = (tab: OrderTab) => {
    setActiveTab(tab)
  }

  const handleRefresh = () => {
    invalidateAllTabs()
  }

  const handleDateFilterChange = (value: "today" | "weekly" | "monthly" | "custom") => {
    setActiveDateFilter(value)
    const range = toDateRange(value, customDateRange)
    if (range) {
      setDateRange(range)
    }
  }

  const handleApplyCustomRange = () => {
    const range = toDateRange("custom", customDateRange)
    if (range) {
      setDateRange(range)
    }
  }

  const handlePickerRangeChange = (range: PickerDateRange) => {
    setActivePickerRange(range)
    setDateRange({ start: range.from, end: range.to })
  }

  const toggleSort = () => {
    setSortDirection((d) => (d === "desc" ? "asc" : "desc"))
  }

  if (isAccessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Loading orders...</span>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <span className="text-sm text-muted-foreground">
            You don&apos;t have permission to view orders and revenue data.
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-red-400 text-sm">{error.message}</p>
      </div>
    )
  }

  return (
    <>
      <NewOrderAlert />
      <div className="space-y-4">
        {/* Header */}
        <h1 className="text-xl font-bold font-display text-foreground">Orders</h1>

        {/* Global Sales Summary */}
        <AdminOrdersSalesSummary label={summaryLabel} totalCents={summaryTotalCents} />

        {/* Date Range Picker — only visible on History */}
        {activeTab === "history" && (
          <DateRangePicker
            activeRange={activePickerRange}
            onRangeChange={handlePickerRangeChange}
            visible
          />
        )}

        {/* Status Filter Bar */}
        <AdminOrdersFilterBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onRefresh={handleRefresh}
          orderCount={sortedOrders.length}
          realtimeConnected={realtimeConnected}
        />

        {/* Sort header */}
        <div className="sticky top-0 z-10 flex items-center justify-between py-2 bg-background/80 backdrop-blur-sm">
          <span className="text-xs text-muted-foreground">
            Sorted: {sortDirection === "desc" ? "Newest first" : "Oldest first"}
          </span>
          <button
            onClick={toggleSort}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
              "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground border border-transparent"
            )}
            aria-label={`Sort ${sortDirection === "desc" ? "oldest first" : "newest first"}`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortDirection === "desc" ? "Newest" : "Oldest"}
          </button>
        </div>

        {/* Tab Content */}
        {isLoading ? (
          <TabSkeleton />
        ) : sortedOrders.length === 0 ? (
          <TabEmptyState tab={activeTab} />
        ) : (
          <>
            {/* History tab: local summary */}
            {activeTab === "history" && (
              <HistoryTabSummary orders={sortedOrders} />
            )}

            {/* Unified row list for all tabs */}
            <div className="space-y-2">
              {sortedOrders.map((order) => (
                <OrderRowCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleRefresh}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
