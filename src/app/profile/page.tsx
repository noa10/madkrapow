'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  User,
  MapPin,
  ShoppingBag,
  LogOut,
  Package,
  ArrowRight,
  Loader2,
  Plus,
  Clock,
  Truck,
  CheckCircle,
} from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useCartStore, type SelectedModifier } from '@/stores/cart'
import { PageContainer } from '@/components/layout/PageContainer'

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

const ACTIVE_STATUSES = ['pending', 'paid', 'accepted', 'preparing', 'ready', 'picked_up']

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string; icon: typeof Clock }> = {
  pending: { color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', label: 'Pending', icon: Clock },
  paid: { color: 'text-blue-400', bgColor: 'bg-blue-500/10', label: 'Paid', icon: CheckCircle },
  accepted: { color: 'text-purple-400', bgColor: 'bg-purple-500/10', label: 'Accepted', icon: Package },
  preparing: { color: 'text-blue-400', bgColor: 'bg-blue-500/10', label: 'Preparing', icon: Clock },
  ready: { color: 'text-green-400', bgColor: 'bg-green-500/10', label: 'Ready', icon: CheckCircle },
  picked_up: { color: 'text-orange-400', bgColor: 'bg-orange-500/10', label: 'On the Way', icon: Truck },
  delivered: { color: 'text-green-400', bgColor: 'bg-green-500/10', label: 'Delivered', icon: CheckCircle },
  cancelled: { color: 'text-red-400', bgColor: 'bg-red-500/10', label: 'Cancelled', icon: Clock },
}

function formatPrice(amount: number): string {
  return `RM ${(amount / 100).toFixed(2)}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

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

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status))
  const pastOrders = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status))

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth')
        return
      }

      const [customerRes, ordersRes] = await Promise.all([
        fetch('/api/customer/profile'),
        fetch('/api/orders'),
      ])

      const customerData = await customerRes.json()
      const ordersData = await ordersRes.json()

      if (!customerData.success) {
        if (customerRes.status === 401) {
          router.push('/auth')
          return
        }
        setError(customerData.error || 'Failed to load profile')
      } else {
        setCustomer(customerData.customer)
      }

      if (ordersData.success) {
        setOrders(ordersData.orders)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setError('Failed to load profile')
    } finally {
      setIsLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscription for order status changes
  useEffect(() => {
    if (!customer?.id) return

    const channel = supabase
      .channel(`customer-orders:${customer.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
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
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
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
        throw new Error(data.error || 'Failed to fetch order items')
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
          special_instructions: item.notes || '',
          unit_price: item.menu_item_price_cents,
        })
      }

      router.push('/cart')
    } catch (err) {
      console.error('Failed to reorder:', err)
      setError('Failed to reorder items')
    } finally {
      setReorderingId(null)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
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
        <PageContainer size="narrow">
          <div className="py-12">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-6 text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <Button onClick={fetchData}>Try Again</Button>
            </div>
          </div>
        </PageContainer>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer>
        <div className="py-8 md:py-12 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-display">Dashboard</h1>
              {customer?.email && (
                <p className="text-muted-foreground text-sm">{customer.email}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>

          {/* Active Orders Section */}
          {activeOrders.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold font-display mb-4 flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                Active Orders
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {activeOrders.length}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {activeOrders.map((order) => {
                  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
                  const StatusIcon = statusConfig.icon

                  return (
                    <div
                      key={order.id}
                      className="rounded-lg border bg-card p-4 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-sm">
                          Order #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{statusConfig.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{formatDate(order.created_at)}</span>
                        <span className="font-medium">{formatPrice(order.total_cents)}</span>
                      </div>
                      <Button asChild className="w-full mt-3" size="sm">
                        <Link href={`/order/${order.id}`}>
                          Track Order
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Account Details */}
            <div className="rounded-lg border bg-card p-5">
              <h2 className="text-base font-semibold font-display mb-4 flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Account Details
              </h2>
              <div className="space-y-2 text-sm">
                {customer?.name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span>{customer.name}</span>
                  </div>
                )}
                {customer?.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{customer.phone}</span>
                  </div>
                )}
                {!customer?.name && !customer?.phone && (
                  <p className="text-muted-foreground text-center py-4">No account details yet</p>
                )}
              </div>
            </div>

            {/* Saved Addresses */}
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold font-display flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Saved Addresses
                </h2>
                <Button variant="ghost" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {!customer?.addresses || customer.addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No saved addresses
                </p>
              ) : (
                <div className="space-y-3">
                  {customer.addresses.map((address) => (
                    <div key={address.id} className="p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{address.label}</span>
                        {address.is_default && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {address.address_line1}
                        {address.address_line2 && `, ${address.address_line2}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {address.postal_code}, {address.city}, {address.state}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Order History */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold font-display flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-primary" />
                Order History
              </h2>
              {pastOrders.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/orders">View All</Link>
                </Button>
              )}
            </div>

            {pastOrders.length === 0 ? (
              <div className="rounded-lg border bg-card p-8 text-center">
                <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No past orders yet</p>
                <Button asChild>
                  <Link href="/menu">Browse Menu</Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastOrders.slice(0, 6).map((order) => {
                  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
                  const StatusIcon = statusConfig.icon

                  return (
                    <div key={order.id} className="rounded-lg border bg-card p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-medium text-sm">
                          Order #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
                          <StatusIcon className="h-3.5 w-3.5" />
                          <span className="text-xs font-medium">{statusConfig.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-muted-foreground">{formatDate(order.created_at)}</span>
                        <span className="font-medium">{formatPrice(order.total_cents)}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleReorder(order.id)}
                          disabled={reorderingId === order.id}
                        >
                          {reorderingId === order.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>Reorder</>
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/order/${order.id}`}>
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </main>
  )
}
