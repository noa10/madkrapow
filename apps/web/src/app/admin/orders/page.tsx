"use client"

import { useEffect, useState, useMemo } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  parseISO,
  format,
} from "date-fns"
import { getBrowserClient } from "@/lib/supabase/client"
import { useRoleGuard } from "@/hooks/use-role-guard"
import { Package, Loader2, ShieldAlert } from "lucide-react"
import { NewOrderAlert, triggerNewOrderAlert } from "@/components/admin/NewOrderAlert"
import { AdminOrdersFilterBar } from "@/components/admin/orders/AdminOrdersFilterBar"
import { AdminOrdersCardView, type OrdersByDateGroup } from "@/components/admin/orders/AdminOrdersCardView"
import { AdminOrdersListView } from "@/components/admin/orders/AdminOrdersListView"
import { AdminOrdersTableView } from "@/components/admin/orders/AdminOrdersTable"
import { AdminOrdersDateFilterBar } from "@/components/admin/orders/AdminOrdersDateFilterBar"
import { AdminOrdersSalesSummary } from "@/components/admin/orders/AdminOrdersSalesSummary"
import type { DateFilterValue, CustomDateRange } from "@/components/admin/orders/AdminOrdersDateFilterBar"

type ViewMode = "cards" | "list" | "table"

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: string | Record<string, unknown> | null
  customer_phone: string | null
  customer_name: string | null
  delivery_type: string
  fulfillment_type: string
  dispatch_status: string | null
  scheduled_for: string | null
  order_kind: string
  approval_status: string
  bulk_company_name: string | null
}

type FilterValue = "all" | "asap" | "scheduled" | "pickup" | "bulk" | "dispatch_failed"

function getDateRangeBounds(filter: DateFilterValue, customRange: CustomDateRange) {
  const now = new Date()
  switch (filter) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) }
    case "weekly":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) }
    case "monthly":
      return { start: startOfMonth(now), end: endOfMonth(now) }
    case "custom":
      if (customRange.start && customRange.end) {
        return {
          start: startOfDay(parseISO(customRange.start)),
          end: endOfDay(parseISO(customRange.end)),
        }
      }
      return null
    default:
      return null
  }
}

function groupOrdersByDate(orders: Order[]): OrdersByDateGroup[] {
  const map = new Map<string, Order[]>()
  for (const order of orders) {
    const key = format(parseISO(order.created_at), "yyyy-MM-dd")
    const existing = map.get(key)
    if (existing) {
      existing.push(order)
    } else {
      map.set(key, [order])
    }
  }
  const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a))
  return sortedKeys.map((key) => ({
    dateKey: key,
    dateLabel: format(parseISO(key), "MMMM d, yyyy"),
    orders: map.get(key) || [],
  }))
}

function calculateTotalCents(orders: Order[]) {
  return orders.reduce((sum, o) => sum + o.total_cents + o.delivery_fee_cents, 0)
}

export default function AdminOrdersPage() {
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard(["admin", "manager", "cashier"]);
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("all")
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({ start: "", end: "" })

  useEffect(() => {
    const supabase = getBrowserClient()

    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) {
        setError(error.message)
        return
      }

      setOrders(data || [])
      setLoading(false)
    }

    fetchOrders()

    const channel = supabase
      .channel("admin-orders-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          setOrders((prev) => [payload.new as Order, ...prev])
          triggerNewOrderAlert()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const nextOrder = payload.new as Order
          setOrders((prev) =>
            prev.map((order) =>
              order.id === nextOrder.id ? nextOrder : order
            )
          )
        }
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true)
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeConnected(false)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const filteredOrders = useMemo(() => {
    let result = orders

    // Type filter
    if (activeFilter === "asap") result = result.filter((o) => o.fulfillment_type === "asap")
    else if (activeFilter === "scheduled") result = result.filter((o) => o.fulfillment_type === "scheduled")
    else if (activeFilter === "pickup") result = result.filter((o) => o.delivery_type === "self_pickup")
    else if (activeFilter === "bulk") result = result.filter((o) => o.order_kind === "bulk")
    else if (activeFilter === "dispatch_failed") result = result.filter((o) => o.dispatch_status === "failed")

    // Date filter
    const bounds = getDateRangeBounds(dateFilter, customDateRange)
    if (bounds) {
      result = result.filter((o) => {
        const d = parseISO(o.created_at)
        return isWithinInterval(d, { start: bounds.start, end: bounds.end })
      })
    }

    return result
  }, [orders, activeFilter, dateFilter, customDateRange])

  const groupedOrders = useMemo(() => groupOrdersByDate(filteredOrders), [filteredOrders])

  // Sales summary: default shows today only; filtered shows filtered period
  const { summaryLabel, summaryTotalCents } = useMemo(() => {
    if (dateFilter === "all") {
      const todayBounds = getDateRangeBounds("today", customDateRange)
      const todayOrders = todayBounds
        ? orders.filter((o) => {
            const d = parseISO(o.created_at)
            return isWithinInterval(d, { start: todayBounds.start, end: todayBounds.end })
          })
        : []
      return { summaryLabel: "Total Sales Today", summaryTotalCents: calculateTotalCents(todayOrders) }
    }

    if (dateFilter === "today") {
      return { summaryLabel: "Total Sales Today", summaryTotalCents: calculateTotalCents(filteredOrders) }
    }
    if (dateFilter === "weekly") {
      return { summaryLabel: "Total Sales This Week", summaryTotalCents: calculateTotalCents(filteredOrders) }
    }
    if (dateFilter === "monthly") {
      return { summaryLabel: "Total Sales This Month", summaryTotalCents: calculateTotalCents(filteredOrders) }
    }
    if (dateFilter === "custom") {
      return {
        summaryLabel: `Total Sales (${customDateRange.start || "..."} to ${customDateRange.end || "..."})`,
        summaryTotalCents: calculateTotalCents(filteredOrders),
      }
    }

    return { summaryLabel: "Total Sales", summaryTotalCents: 0 }
  }, [dateFilter, filteredOrders, orders, customDateRange])

  if (isAccessLoading || loading) {
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
          <span className="text-sm text-muted-foreground">You don&apos;t have permission to view orders and revenue data.</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    )
  }

  return (
    <>
      <NewOrderAlert />
      <div className="space-y-6">
        {/* Header */}
        <h1 className="text-xl font-bold font-display text-foreground">Orders</h1>

        {/* Sales Summary */}
        <AdminOrdersSalesSummary label={summaryLabel} totalCents={summaryTotalCents} />

        {/* Date Filter Bar */}
        <AdminOrdersDateFilterBar
          activeFilter={dateFilter}
          onFilterChange={setDateFilter}
          customRange={customDateRange}
          onCustomRangeChange={setCustomDateRange}
          onApplyCustomRange={() => {
            if (customDateRange.start && customDateRange.end) {
              setDateFilter("custom")
            }
          }}
        />

        {/* Type Filter Bar */}
        <AdminOrdersFilterBar
          activeFilter={activeFilter}
          onFilterChange={(v) => setActiveFilter(v as FilterValue)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          orderCount={filteredOrders.length}
          realtimeConnected={realtimeConnected}
        />

        {/* Content */}
        {filteredOrders.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm mb-4">No orders match this filter</p>
          </div>
        ) : (
          <>
            {viewMode === "cards" && <AdminOrdersCardView groups={groupedOrders} />}
            {viewMode === "list" && <AdminOrdersListView groups={groupedOrders} />}
            {viewMode === "table" && <AdminOrdersTableView groups={groupedOrders} />}
          </>
        )}
      </div>
    </>
  )
}
