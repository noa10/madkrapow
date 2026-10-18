"use client"

import { useEffect, useState } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAdminOrdersStore } from "@/stores/adminOrdersStore"
import { triggerNewOrderAlert } from "@/components/admin/NewOrderAlert"
import type { Order, OrderTab } from "@/types/orders"
import { determineAffectedTabs } from "../utils/determineAffectedTabs"

const ALL_TABS: readonly OrderTab[] = ["preparing", "ready", "upcoming", "history"]

/** One refetch per tab per realtime burst window. */
const INVALIDATION_DEBOUNCE_MS = 500

export function useRealtimeOrderUpdates() {
  const [realtimeConnected, setRealtimeConnected] = useState(false)

  useEffect(() => {
    const supabase = getBrowserClient()
    const pendingTabs = new Set<OrderTab>()
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const flush = () => {
      flushTimer = null
      if (disposed || document.hidden) return

      const tabs = Array.from(pendingTabs)
      pendingTabs.clear()
      if (tabs.length === 0) return

      const store = useAdminOrdersStore.getState()
      if (tabs.length === ALL_TABS.length) {
        store.invalidateAllTabs()
      } else {
        tabs.forEach((tab) => store.invalidateTab(tab))
      }
    }

    const scheduleInvalidation = (tabs: readonly OrderTab[]) => {
      if (disposed) return
      tabs.forEach((tab) => pendingTabs.add(tab))

      // No timer while hidden: events are queued cheaply and flushed once when
      // the tab becomes visible again (see the visibility listener below).
      if (document.hidden || flushTimer !== null) return
      flushTimer = setTimeout(flush, INVALIDATION_DEBOUNCE_MS)
    }

    const handleVisibilityChange = () => {
      if (document.hidden || flushTimer !== null || pendingTabs.size === 0) return
      flushTimer = setTimeout(flush, 0)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    const channel = supabase
      .channel("admin-orders-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (_payload: RealtimePostgresChangesPayload<Order>) => {
          // The alert is intentionally immediate; only the cache refresh is
          // coalesced so a burst of inserts cannot storm the DB.
          triggerNewOrderAlert()
          scheduleInvalidation(ALL_TABS)
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

          // Invalidate union of old and new tab assignments, coalesced so a
          // burst of status updates produces at most one refetch per tab.
          scheduleInvalidation([...new Set([...oldTabs, ...newTabs])])

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
        (_payload: RealtimePostgresChangesPayload<{ order_id: string }>) => {
          // Delivery fee or driver info changed — refresh all tabs, once per burst.
          scheduleInvalidation(ALL_TABS)
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
      disposed = true
      if (flushTimer !== null) clearTimeout(flushTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [])

  return { realtimeConnected }
}
