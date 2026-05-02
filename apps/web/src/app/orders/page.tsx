"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Menu, Package, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { DashboardPageContainer } from "@/components/dashboard/DashboardPageContainer"
import { OrdersFilterBar } from "@/components/orders/OrdersFilterBar"
import { OrdersCardView } from "@/components/orders/OrdersCardView"
import { OrdersListView } from "@/components/orders/OrdersListView"
import { OrdersTableView } from "@/components/orders/OrdersTableView"

type ViewMode = "cards" | "list" | "table"

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
  fulfillment_type: string
}

function OrdersContent() {
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get("status") || "all"

  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState(initialStatus)
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    async function fetchOrders() {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (activeFilter !== "all") {
          params.set("status", activeFilter)
        }

        const response = await fetch(`/api/orders?${params.toString()}`)
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
    }

    fetchOrders()
  }, [activeFilter])

  return (
    <>
      <DashboardSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <DashboardPageContainer>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold font-display">Order History</h1>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-xl font-bold font-display">Order History</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Browse and track all your orders</p>
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-white/8">
            <Link href="/profile">
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {/* Filter Bar */}
        <OrdersFilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          orderCount={orders.length}
        />

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
          <div className="rounded-xl border border-white/8 bg-card p-12 text-center backdrop-blur-sm">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-4 text-sm">No orders found</p>
            <Button asChild>
              <Link href="/">Browse Menu</Link>
            </Button>
          </div>
        )}

        {!isLoading && !error && orders.length > 0 && viewMode === "cards" && (
          <OrdersCardView orders={orders} />
        )}

        {!isLoading && !error && orders.length > 0 && viewMode === "list" && (
          <OrdersListView orders={orders} />
        )}

        {!isLoading && !error && orders.length > 0 && viewMode === "table" && (
          <OrdersTableView orders={orders} />
        )}
      </DashboardPageContainer>
    </>
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
