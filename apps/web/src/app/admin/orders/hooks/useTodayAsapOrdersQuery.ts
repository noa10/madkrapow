"use client"

import { useEffect, useMemo, useState } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { startOfDay, endOfDay } from "date-fns"
import { getBrowserClient } from "@/lib/supabase/client"
import type { Order } from "@/types/orders"

/** The dashboard summary only needs each order's value and status. */
const TODAY_ASAP_SELECT = "status, total_cents"

/** Coalesce realtime bursts into at most one refetch per window. */
const REFETCH_DEBOUNCE_MS = 500

export type TodayAsapOrder = Pick<Order, "status" | "total_cents">

type TodayAsapRealtimeRecord = Pick<Order, "fulfillment_type">

export function useTodayAsapOrdersQuery() {
  const [allOrders, setAllOrders] = useState<TodayAsapOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    let refetchTimer: ReturnType<typeof setTimeout> | null = null
    let refetchPending = false
    let requestId = 0
    const supabase = getBrowserClient()
    const now = new Date()

    const fetchTodayAsap = async () => {
      const currentRequest = ++requestId
      refetchPending = false
      setIsLoading(true)
      try {
        const { data, error: dbError } = await supabase
          .from("orders")
          .select(TODAY_ASAP_SELECT)
          .eq("fulfillment_type", "asap")
          .gte("created_at", startOfDay(now).toISOString())
          .lte("created_at", endOfDay(now).toISOString())
          .order("created_at", { ascending: false })
          .limit(500)

        if (dbError) throw dbError
        if (!cancelled && currentRequest === requestId) {
          setAllOrders((data ?? []) as TodayAsapOrder[])
          setError(null)
        }
      } catch (err) {
        if (!cancelled && currentRequest === requestId) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled && currentRequest === requestId) {
          setIsLoading(false)
        }
      }
    }

    const scheduleRefetch = () => {
      if (cancelled) return
      refetchPending = true
      // Do not even start a timer for a background tab.
      if (document.hidden || refetchTimer !== null) return

      refetchTimer = setTimeout(() => {
        refetchTimer = null
        // The tab went hidden during the debounce window; keep the pending
        // flag so `visibilitychange` can resume with one refetch.
        if (document.hidden) return
        fetchTodayAsap()
      }, REFETCH_DEBOUNCE_MS)
    }

    const handleVisibilityChange = () => {
      if (document.hidden || !refetchPending || refetchTimer !== null) return
      refetchTimer = setTimeout(() => {
        refetchTimer = null
        if (!document.hidden) fetchTodayAsap()
      }, 0)
    }

    fetchTodayAsap()

    // Re-fetch on realtime events for ASAP orders
    const channel = supabase
      .channel("today-asap-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<TodayAsapRealtimeRecord>) => {
          const record = (payload.new ?? payload.old) as
            | TodayAsapRealtimeRecord
            | undefined
          if (record?.fulfillment_type === "asap") {
            scheduleRefetch()
          }
        }
      )
      .subscribe()

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      if (refetchTimer !== null) clearTimeout(refetchTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [])

  // "Total Sales Today" must not count cancelled orders. The sole caller
  // (`admin/orders/page.tsx`) sums `orders`, so cancelled rows are filtered
  // out here; the full set stays available as `allOrders` for any future caller.
  const orders = useMemo(
    () => allOrders.filter((o) => o.status !== "cancelled"),
    [allOrders]
  )

  return { orders, allOrders, isLoading, error }
}
