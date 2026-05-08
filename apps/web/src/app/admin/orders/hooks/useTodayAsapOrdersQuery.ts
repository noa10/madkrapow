"use client"

import { useEffect, useState } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { startOfDay, endOfDay } from "date-fns"
import { getBrowserClient } from "@/lib/supabase/client"
import type { Order } from "@/types/orders"

export function useTodayAsapOrdersQuery() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = getBrowserClient()
    const now = new Date()

    const fetchTodayAsap = async () => {
      setIsLoading(true)
      try {
        const { data, error: dbError } = await supabase
          .from("orders")
          .select("*")
          .eq("fulfillment_type", "asap")
          .gte("created_at", startOfDay(now).toISOString())
          .lte("created_at", endOfDay(now).toISOString())
          .order("created_at", { ascending: false })
          .limit(500)

        if (dbError) throw dbError
        if (!cancelled) {
          setOrders((data ?? []) as Order[])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchTodayAsap()

    // Re-fetch on realtime events for ASAP orders
    const channel = supabase
      .channel("today-asap-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const record = (payload.new ?? payload.old) as Order | undefined
          if (record && record.fulfillment_type === "asap") {
            fetchTodayAsap()
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [])

  return { orders, isLoading, error }
}
