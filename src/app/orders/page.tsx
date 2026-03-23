'use client'

import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Clock, Package, CheckCircle, XCircle, MapPin, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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

const STATUS_FILTERS = [
  { value: 'all', label: 'All Orders' },
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'picked_up', label: 'On the Way' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending' },
  paid: { icon: Clock, color: 'text-blue-500', label: 'Paid' },
  accepted: { icon: Package, color: 'text-purple-500', label: 'Accepted' },
  preparing: { icon: Package, color: 'text-blue-500', label: 'Preparing' },
  ready: { icon: CheckCircle, color: 'text-green-500', label: 'Ready' },
  picked_up: { icon: MapPin, color: 'text-orange-500', label: 'On the Way' },
  delivered: { icon: CheckCircle, color: 'text-green-500', label: 'Delivered' },
  cancelled: { icon: XCircle, color: 'text-red-500', label: 'Cancelled' },
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
    hour: '2-digit',
    minute: '2-digit',
  })
}

function OrdersContent() {
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') || 'all'

  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState(initialStatus)

  useEffect(() => {
    async function fetchOrders() {
      setIsLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (activeFilter !== 'all') {
          params.set('status', activeFilter)
        }

        const response = await fetch(`/api/orders?${params.toString()}`)
        const data = await response.json()

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch orders')
        }

        setOrders(data.orders)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrders()
  }, [activeFilter])

  const handleFilterChange = (status: string) => {
    setActiveFilter(status)
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My Orders</h1>
          <p className="text-muted-foreground">View and track your order history</p>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={activeFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleFilterChange(filter.value)}
              className="whitespace-nowrap"
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <p className="text-red-600 text-center">{error}</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && orders.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No orders found</p>
              <Button asChild>
                <Link href="/">Browse Menu</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => {
              const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
              const StatusIcon = statusConfig.icon

              return (
                <Card key={order.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        Order #{order.id.slice(0, 8).toUpperCase()}
                      </CardTitle>
                      <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">{statusConfig.label}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span>{formatDate(order.created_at)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-medium">{formatPrice(order.total_cents)}</span>
                      </div>
                      {order.delivery_type === 'self_pickup' && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Type</span>
                          <span>Pickup</span>
                        </div>
                      )}
                    </div>
                    <Button asChild className="w-full mt-4" variant="outline">
                      <Link href={`/order/${order.id}`}>
                        Track Order
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background">
          <div className="max-w-2xl mx-auto p-4 md:p-6 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      }
    >
      <OrdersContent />
    </Suspense>
  )
}
