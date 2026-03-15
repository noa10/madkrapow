'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  User,
  MapPin,
  ShoppingBag,
  LogOut,
  Package,
  MapPin as MapPinIcon,
  ArrowRight,
  Loader2,
  Plus,
} from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCartStore, type SelectedModifier } from '@/stores/cart'

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
  total_amount: number
  delivery_fee: number
  created_at: string
  delivery_address: Record<string, unknown>
}

interface OrderItemModifier {
  id: string
  modifier_name: string
  modifier_price_delta_cents: number
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: 'text-yellow-500', label: 'Pending' },
  preparing: { color: 'text-blue-500', label: 'Preparing' },
  delivering: { color: 'text-orange-500', label: 'On the Way' },
  completed: { color: 'text-green-500', label: 'Delivered' },
  cancelled: { color: 'text-red-500', label: 'Cancelled' },
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
        <div className="max-w-2xl mx-auto p-4 md:p-6">
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Button onClick={fetchData}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Profile</h1>
            {customer?.email && (
              <p className="text-muted-foreground">{customer.email}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Account Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Saved Addresses
              </CardTitle>
              <Button variant="ghost" size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!customer?.addresses || customer.addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No saved addresses
              </p>
            ) : (
              <div className="space-y-3">
                {customer.addresses.map((address) => (
                  <div
                    key={address.id}
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
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
                        {address.instructions && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Note: {address.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Order History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {!orders || orders.length === 0 ? (
              <div className="text-center py-6">
                <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-4">No orders yet</p>
                <Button asChild>
                  <Link href="/menu">Browse Menu</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.slice(0, 5).map((order) => {
                  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending

                  return (
                    <div
                      key={order.id}
                      className="p-4 rounded-lg border bg-card"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            Order #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={`text-xs ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(order.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {formatPrice(order.total_amount)}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReorder(order.id)}
                            disabled={reorderingId === order.id}
                          >
                            {reorderingId === order.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                Reorder
                                <ArrowRight className="h-4 w-4 ml-1" />
                              </>
                            )}
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/order/${order.id}`}>
                              <MapPinIcon className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {orders.length > 5 && (
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/orders">View All Orders</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
