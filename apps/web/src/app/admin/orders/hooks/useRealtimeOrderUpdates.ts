"use client"

import { useEffect, useState } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAdminOrdersStore } from "@/stores/adminOrdersStore"
import { triggerNewOrderAlert } from "@/components/admin/NewOrderAlert"
import type { Order } from "@/types/orders"
import { determineAffectedTabs } from "../utils/determineAffectedTabs"

export function useRealtimeOrderUpdates() {
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  useEffect(() => {
    const supabase = getBrowserClient()

    const channel = supabase
      .channel("admin-orders-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (_payload: RealtimePostgresChangesPayload<Order>) => {
          const store = useAdminOrdersStore.getState()
          store.invalidateAllTabs()
          triggerNewOrderAlert()
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const oldRecord = payload.old as Order
          const newRecord = payload.new as Order
          const store = useAdminOrdersStore.getState()

          // Determine old tabs from assignment map
          const assignments = store.orderTabAssignments
          const oldTabs = assignments.get(oldRecord.id) ?? determineAffectedTabs(oldRecord)
          const newTabs = determineAffectedTabs(newRecord)

          // Invalidate union of old and new tab assignments
          const tabsToInvalidate = new Set([...oldTabs, ...newTabs])
          tabsToInvalidate.forEach((t) => store.invalidateTab(t))

          // Update the map with new assignments
          const nextAssignments = new Map(assignments)
          nextAssignments.set(newRecord.id, newTabs)
          store.setOrderTabAssignments(nextAssignments)

          // Also update the order in any tab caches that still contain it
          ;(["preparing", "ready", "upcoming", "history"] as const).forEach((tab) => {
            const cache = store.caches[tab]
            const idx = cache.orders.findIndex((o) => o.id === newRecord.id)
            if (idx !== -1) {
              const updated = [...cache.orders]
              updated[idx] = newRecord
              store.setTabOrders(tab, updated)
            }
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const deleted = payload.old as Order
          const store = useAdminOrdersStore.getState()

          ;(["preparing", "ready", "upcoming", "history"] as const).forEach((tab) => {
            const cache = store.caches[tab]
            if (cache.orders.some((o) => o.id === deleted.id)) {
              store.setTabOrders(
                tab,
                cache.orders.filter((o) => o.id !== deleted.id)
              )
            }
          })

          const nextAssignments = new Map(store.orderTabAssignments)
          nextAssignments.delete(deleted.id)
          store.setOrderTabAssignments(nextAssignments)
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lalamove_shipments" },
        (payload: RealtimePostgresChangesPayload<{ order_id: string }>) => {
          // Delivery fee or driver info changed — invalidate all tabs to refresh
          const store = useAdminOrdersStore.getState()
          store.invalidateAllTabs()
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

  return { realtimeConnected }
}
