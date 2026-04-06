"use client"

import { useEffect, useState, useCallback } from "react"
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"
import { Menu, LogOut, Loader2 } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { useCartStore, type SelectedModifier } from "@/stores/cart"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { DashboardPageContainer } from "@/components/dashboard/DashboardPageContainer"
import { DashboardStats } from "@/components/dashboard/DashboardStats"
import { QuickActions } from "@/components/dashboard/QuickActions"
import { ActiveOrdersSection } from "@/components/dashboard/ActiveOrdersSection"
import { ProfileInfoCard } from "@/components/dashboard/ProfileInfoCard"
import { RecentOrdersSection } from "@/components/dashboard/RecentOrdersSection"
import { Button } from "@/components/ui/button"

interface CustomerAddress {
  id: string
  label: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  instructions: string | null
  is_default: boolean
}

interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  addresses: CustomerAddress[]
}

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
}

interface OrderItemModifier {
  id: string
  modifier_name: string
  modifier_price_delta_cents: number
}

const ACTIVE_STATUSES = ["pending", "paid", "accepted", "preparing", "ready", "picked_up"]

export default function ProfilePage() {
  const router = useRouter()
  const supabase = getBrowserClient()
  const addItem = useCartStore((state) => state.addItem)
  const clearCart = useCartStore((state) => state.clear)

  const [isLoading, setIsLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reorderingId, setReorderingId] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))
  const pastOrders = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status))

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth")
        return
      }

      const [customerRes, ordersRes] = await Promise.all([
        fetch("/api/customer/profile"),
        fetch("/api/orders"),
      ])

      const customerData = await customerRes.json()
      const ordersData = await ordersRes.json()

      if (!customerData.success) {
        if (customerRes.status === 401) {
          router.push("/auth")
          return
        }
        setError(customerData.error || "Failed to load profile")
      } else {
        setCustomer(customerData.customer)
      }

      if (ordersData.success) {
        setOrders(ordersData.orders)
      }
    } catch (err) {
      console.error("Failed to fetch data:", err)
      setError("Failed to load profile")
    } finally {
      setIsLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!customer?.id) return

    const channel = supabase
      .channel(`customer-orders:${customer.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `customer_id=eq.${customer.id}`,
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
          filter: `customer_id=eq.${customer.id}`,
        },
        () => {
          fetchData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [customer?.id, supabase, fetchData])

  const handleReorder = async (orderId: string) => {
    setReorderingId(orderId)
    try {
      const response = await fetch(`/api/orders/${orderId}/items`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch order items")
      }

      clearCart()

      for (const item of data.orderItems) {
        const modifiers: SelectedModifier[] = item.modifiers.map((mod: OrderItemModifier) => ({
          id: mod.id,
          name: mod.modifier_name,
          price_delta_cents: mod.modifier_price_delta_cents,
        }))

        addItem({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          selected_modifiers: modifiers,
          special_instructions: item.notes || "",
          unit_price: item.menu_item_price_cents,
        })
      }

      router.push("/cart")
    } catch (err) {
      console.error("Failed to reorder:", err)
      setError("Failed to reorder items")
    } finally {
      setReorderingId(null)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (error && !customer) {
    return (
      <main className="min-h-screen bg-background">
        <DashboardPageContainer>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center max-w-sm">
              <p className="text-red-400 mb-4 text-sm">{error}</p>
              <Button onClick={fetchData}>Try Again</Button>
            </div>
          </div>
        </DashboardPageContainer>
      </main>
    )
  }

  return (
    <>
      <DashboardSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

      <DashboardPageContainer>
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold font-heading text-foreground">Dashboard</h1>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold font-heading text-foreground">Dashboard</h1>
            {customer?.email && (
              <p className="text-sm text-muted-foreground mt-0.5">{customer.email}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>

        <div className="space-y-6">
          {/* Stats */}
          <DashboardStats orders={orders} />

          {/* Quick Actions */}
          <QuickActions />

          {/* Active Orders */}
          <ActiveOrdersSection orders={activeOrders} />

          {/* Profile & Addresses */}
          <ProfileInfoCard customer={customer} />

          {/* Recent Orders */}
          <RecentOrdersSection
            orders={pastOrders}
            onReorder={handleReorder}
            reorderingId={reorderingId}
            onViewAll={() => router.push("/orders")}
          />
        </div>
      </DashboardPageContainer>
    </>
  )
}
