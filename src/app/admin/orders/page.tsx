"use client"

import { useEffect, useState, useMemo } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { getBrowserClient } from "@/lib/supabase/client"
import { Package, Loader2 } from "lucide-react"
import { NewOrderAlert, triggerNewOrderAlert } from "@/components/admin/NewOrderAlert"
import { AdminOrdersFilterBar } from "@/components/admin/orders/AdminOrdersFilterBar"
import { AdminOrdersCardView } from "@/components/admin/orders/AdminOrdersCardView"
import { AdminOrdersListView } from "@/components/admin/orders/AdminOrdersListView"
import { AdminOrdersTableView } from "@/components/admin/orders/AdminOrdersTable"

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

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterValue>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [realtimeConnected, setRealtimeConnected] = useState(false)

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
    if (activeFilter === "all") return orders
    if (activeFilter === "asap") return orders.filter(o => o.fulfillment_type === "asap")
    if (activeFilter === "scheduled") return orders.filter(o => o.fulfillment_type === "scheduled")
    if (activeFilter === "pickup") return orders.filter(o => o.delivery_type === "self_pickup")
    if (activeFilter === "bulk") return orders.filter(o => o.order_kind === "bulk")
    if (activeFilter === "dispatch_failed") return orders.filter(o => o.dispatch_status === "failed")
    return orders
  }, [orders, activeFilter])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Loading orders...</span>
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
        <h1 className="text-xl font-bold font-heading text-foreground">Orders</h1>

        {/* Filter Bar */}
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
          <div className="rounded-xl border border-white/8 bg-card/60 p-12 text-center backdrop-blur-sm">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-sm mb-4">No orders match this filter</p>
          </div>
        ) : (
          <>
            {viewMode === "cards" && <AdminOrdersCardView orders={filteredOrders} />}
            {viewMode === "list" && <AdminOrdersListView orders={filteredOrders} />}
            {viewMode === "table" && <AdminOrdersTableView orders={filteredOrders} />}
          </>
        )}
      </div>
    </>
  )
}
