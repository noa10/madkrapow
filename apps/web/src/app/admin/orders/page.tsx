"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, ShieldAlert } from "lucide-react"
import { useRoleGuard } from "@/hooks/use-role-guard"
import { NewOrderAlert } from "@/components/admin/NewOrderAlert"
import { DateRangePicker, type DateRange as PickerDateRange } from "@/components/admin/orders/DateRangePicker"
import { HistoryTabSummary } from "@/components/admin/orders/HistoryTabSummary"
import { OrderCard } from "@/components/admin/orders/OrderCard"
import { OrderItemPreviewModal } from "@/components/admin/orders/OrderItemPreviewModal"
import { OrdersMetricCards } from "@/components/admin/orders/OrdersMetricCards"
import { OrdersToolbar } from "@/components/admin/orders/OrdersToolbar"
import { StatusTabs } from "@/components/admin/orders/StatusTabs"
import { TabEmptyState } from "@/components/admin/orders/TabEmptyState"
import { TabSkeleton } from "@/components/admin/orders/TabSkeleton"
import { matchesOrderQuery } from "@/lib/orders/search"
import { useAdminOrdersStore } from "@/stores/adminOrdersStore"
import { useOrderTabCounts } from "./hooks/useOrderTabCounts"
import { useOrderTabQuery } from "./hooks/useOrderTabQuery"
import { useRealtimeOrderUpdates } from "./hooks/useRealtimeOrderUpdates"
import { useTodayAsapOrdersQuery } from "./hooks/useTodayAsapOrdersQuery"
import { toDateRange } from "./utils/toDateRange"
import type { Order, OrderSource, OrderTab } from "@/types/orders"

type SortDirection = "desc" | "asc"

export default function AdminOrdersPage() {
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard(["admin", "manager", "cashier"])

  const activeTab = useAdminOrdersStore((s) => s.activeTab)
  const caches = useAdminOrdersStore((s) => s.caches)
  const sourceFilter = useAdminOrdersStore((s) => s.sourceFilter)
  const setActiveTab = useAdminOrdersStore((s) => s.setActiveTab)
  const setDateRange = useAdminOrdersStore((s) => s.setDateRange)
  const setSourceFilter = useAdminOrdersStore((s) => s.setSourceFilter)
  const invalidateAllTabs = useAdminOrdersStore((s) => s.invalidateAllTabs)

  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [search, setSearch] = useState("")
  const [activePickerRange, setActivePickerRange] = useState<PickerDateRange | null>(null)
  // Order whose item list is open in the preview modal, or null when closed.
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null)

  // Initialize date range to Today on mount
  useEffect(() => {
    const range = toDateRange("today", { start: "", end: "" })
    if (range) {
      setDateRange(range)
    }
  }, [setDateRange])

  // Tab data fetching
  useOrderTabQuery(activeTab)

  // Per-tab counters for the status pills and the Active Orders metric
  const { counts, unpaidCount } = useOrderTabCounts()

  // Realtime subscriptions
  const { realtimeConnected } = useRealtimeOrderUpdates()

  // Global "Today's Sales" summary (ASAP orders today, cancelled excluded)
  const { orders: todayAsapOrders } = useTodayAsapOrdersQuery()

  const summaryTotalCents = useMemo(
    () => todayAsapOrders.reduce((sum, o) => sum + o.total_cents + o.delivery_fee_cents, 0),
    [todayAsapOrders]
  )

  // Preparing + Ready are the orders still in flight; null-propagate so the
  // metric reads "—" until both counts land rather than showing a partial sum.
  const activeOrdersCount = useMemo(() => {
    if (counts.preparing === null || counts.ready === null) return null
    return counts.preparing + counts.ready
  }, [counts.preparing, counts.ready])

  const activeCache = caches[activeTab]
  const isLoading = activeCache.isLoading
  const error = activeCache.error

  // Sort then filter: the sort is stable and the filter is cheap enough to run
  // on every keystroke over the loaded tab (200-row ceiling).
  const visibleOrders = useMemo(() => {
    const sorted = [...activeCache.orders].sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return sortDirection === "desc" ? -diff : diff
    })
    const query = search.trim()
    if (!query) return sorted
    return sorted.filter((order) => matchesOrderQuery(order, query))
  }, [activeCache.orders, sortDirection, search])

  const hasSearch = search.trim().length > 0

  const handleTabChange = (tab: OrderTab) => {
    setActiveTab(tab)
  }

  const handleRefresh = () => {
    invalidateAllTabs()
  }

  const handleSourceFilterChange = (source: "all" | OrderSource) => {
    setSourceFilter(source)
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
        <h1 className="text-xl font-bold font-heading text-foreground">Orders</h1>

        <OrdersMetricCards
          totalSalesCents={summaryTotalCents}
          activeOrders={activeOrdersCount}
          unpaidOrders={unpaidCount}
        />

        <OrdersToolbar
          search={search}
          onSearchChange={setSearch}
          sourceFilter={sourceFilter}
          onSourceFilterChange={handleSourceFilterChange}
          onRefresh={handleRefresh}
          realtimeConnected={realtimeConnected}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
        />

        <StatusTabs activeTab={activeTab} onTabChange={handleTabChange} counts={counts} />

        {/* Date Range Picker — only visible on History */}
        {activeTab === "history" && (
          <DateRangePicker
            activeRange={activePickerRange}
            onRangeChange={handlePickerRangeChange}
            visible
          />
        )}

        {/* Tab Content */}
        {isLoading && !hasSearch ? (
          <TabSkeleton />
        ) : visibleOrders.length === 0 ? (
          <TabEmptyState tab={activeTab} />
        ) : (
          <>
            {/* History tab: local summary */}
            {activeTab === "history" && <HistoryTabSummary orders={visibleOrders} />}

            {hasSearch && (
              <p className="text-xs text-muted-foreground/60">
                {visibleOrders.length} of {activeCache.orders.length}{" "}
                {activeCache.orders.length === 1 ? "order" : "orders"} match
              </p>
            )}

            <div className="space-y-2">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStatusChange={handleRefresh}
                  onOpenItems={setPreviewOrder}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <OrderItemPreviewModal
        open={previewOrder !== null}
        order={previewOrder}
        onClose={() => setPreviewOrder(null)}
      />
    </>
  )
}
