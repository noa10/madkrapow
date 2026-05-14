"use client"

import { useEffect } from "react"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAdminOrdersStore } from "@/stores/adminOrdersStore"
import type { Order, OrderTab } from "@/types/orders"
import { ADMIN_TAB_STATUSES } from "@/lib/orders/status"

const ORDER_SELECT = "*, order_items(quantity), source, customer_id"

export function useOrderTabQuery(tab: OrderTab) {
  const dateRange = useAdminOrdersStore((s) => s.dateRange)
  const refetchTrigger = useAdminOrdersStore((s) => s.caches[tab].refetchTrigger)
  const sourceFilter = useAdminOrdersStore((s) => s.sourceFilter)
  const setTabLoading = useAdminOrdersStore((s) => s.setTabLoading)
  const setTabOrders = useAdminOrdersStore((s) => s.setTabOrders)
  const setTabError = useAdminOrdersStore((s) => s.setTabError)

  useEffect(() => {
    let cancelled = false
    const supabase = getBrowserClient()

    const fetchTabOrders = async () => {
      function withItemCount(orders: Order[]): Order[] {
        return orders.map((o: Order) => {
          const any = o as any
          const items = (any.order_items as { quantity: number }[] | undefined) ?? []
          const { order_items, ...rest } = any
          return { ...rest, item_count: items.reduce((s, i) => s + i.quantity, 0) } as Order
        })
      }
      setTabLoading(tab, true)

      try {
        let orders: Order[] = []

        const applySourceFilter = (query: any) => {
          if (sourceFilter !== "all") {
            return query.eq("source", sourceFilter)
          }
          return query
        }

        if (tab === "preparing") {
          let query = supabase
            .from("orders")
            .select(ORDER_SELECT)
            .in("status", ["pending", "paid", "preparing"])
            .eq("fulfillment_type", "asap")
            .order("created_at", { ascending: false })
            .limit(200)
          query = applySourceFilter(query)
          const { data, error } = await query

          if (error) throw error
          orders = withItemCount((data ?? []) as Order[])
        } else if (tab === "ready") {
          let query = supabase
            .from("orders")
            .select(ORDER_SELECT)
            .eq("status", "ready")
            .eq("fulfillment_type", "asap")
            .order("created_at", { ascending: false })
            .limit(200)
          query = applySourceFilter(query)
          const { data, error } = await query

          if (error) throw error
          orders = withItemCount((data ?? []) as Order[])
        } else if (tab === "upcoming") {
          const [bulkRes, scheduledRes] = await Promise.all([
            applySourceFilter(
              supabase
                .from("orders")
                .select(ORDER_SELECT)
                .eq("order_kind", "bulk")
                .order("created_at", { ascending: false })
                .limit(200)
            ),
            applySourceFilter(
              supabase
                .from("orders")
                .select(ORDER_SELECT)
                .eq("fulfillment_type", "schedule")
                .order("created_at", { ascending: false })
                .limit(200)
            ),
          ])

          if (bulkRes.error) throw bulkRes.error
          if (scheduledRes.error) throw scheduledRes.error

          const merged = new Map<string, Order>()
          for (const o of withItemCount([...(bulkRes.data ?? []), ...(scheduledRes.data ?? [])] as Order[])) {
            merged.set(o.id, o)
          }

          orders = Array.from(merged.values())
            .filter((o) => !["picked_up", "delivered", "cancelled"].includes(o.status))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 200)
        } else if (tab === "history") {
          const { start, end } = dateRange
          if (!start || !end) {
            orders = []
          } else {
            let query = supabase
              .from("orders")
              .select(ORDER_SELECT)
              .in("status", [...ADMIN_TAB_STATUSES.history])
              .gte("created_at", start)
              .lte("created_at", end)
              .order("created_at", { ascending: false })
              .limit(200)
            query = applySourceFilter(query)
            const { data, error } = await query

            if (error) throw error
            orders = withItemCount((data ?? []) as Order[])
          }
        }

        if (!cancelled) {
          setTabOrders(tab, orders)
        }
      } catch (err) {
        if (!cancelled) {
          setTabError(tab, err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    fetchTabOrders()

    return () => {
      cancelled = true
    }
    // Zustand setters are stable references; including them causes unnecessary re-subscriptions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateRange.start, dateRange.end, refetchTrigger, sourceFilter])
}
