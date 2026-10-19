"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import Link from "next/link"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { Package, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getBrowserClient } from "@/lib/supabase/client"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { OrdersCardView } from "@/components/orders/OrdersCardView"

interface Order {
  id: string
  display_code?: string | null
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
  fulfillment_type: string
  include_cutlery: boolean
  item_count: number
}

function OrdersContent() {
  const supabase = getBrowserClient()

  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/orders`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch orders")
      }

      setOrders(data.orders)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  useEffect(() => {
    const channel = supabase
      .channel("orders-page")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const updatedOrder = payload.new as Order
          setOrders((prev) =>
            prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o))
          )
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
        },
        () => {
          fetchOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchOrders])

  return (
    <ClientPageShell activeHref="/orders">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-[-0.02em]">Food Orders</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Browse and track all your food orders</p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-border">
            <Link href="/profile">
              Back to Profile
            </Link>
          </Button>
        </div>

        <div className="space-y-6">
          {/* Content */}
          {isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {!isLoading && !error && orders.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-12 text-center backdrop-blur-sm">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4 text-sm">No orders found</p>
              <Button asChild>
                <Link href="/">Browse Menu</Link>
              </Button>
            </div>
          )}

          {!isLoading && !error && orders.length > 0 && (
            <OrdersCardView orders={orders} />
          )}
        </div>
      </div>
    </ClientPageShell>
  )
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      }
    >
      <OrdersContent />
    </Suspense>
  )
}
