'use client'

import { useEffect, useState, useCallback } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { 
  Package, 
  MapPin, 
  Clock, 
  ChevronLeft,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  Circle,
  Loader2
} from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DriverInfo } from '@/components/order/DriverInfo'

interface OrderItem {
  id: string
  menu_item_name: string
  menu_item_price_cents: number
  quantity: number
  line_total_cents: number
}

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  delivery_address_json: Record<string, unknown> | null
  lalamove_order_id: string | null
  lalamove_status: string | null
  driver_name: string | null
  driver_phone: string | null
  driver_plate_number: string | null
  created_at: string
  delivery_type: string
  fulfillment_type: string
  scheduled_for: string | null
  order_kind: string
  approval_status: string
  bulk_company_name: string | null
  review_notes: string | null
  order_items?: OrderItem[]
}

type OrderStatus = 'pending' | 'paid' | 'accepted' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled'

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending Payment',
  paid: 'Paid',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function OrderTrackingPage() {
  const params = useParams()
  const orderId = params?.id as string
  
  const [order, setOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchOrder = useCallback(async () => {
    try {
      const supabase = getBrowserClient()
      
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (orderError || !orderData) {
        setError('Order not found')
        return
      }

      setOrder(orderData)

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)

      if (!itemsError && itemsData) {
        setOrderItems(itemsData)
      }
    } catch (err) {
      console.error('Failed to fetch order:', err)
      setError('Failed to load order')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchOrder()
  }, [fetchOrder])

  useEffect(() => {
    if (!orderId) return

    const supabase = getBrowserClient()
    
    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          console.log('Order updated:', payload)
          setRefreshing(true)
          fetchOrder()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_items',
          filter: `order_id=eq.${orderId}`
        },
        () => {
          fetchOrder()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, fetchOrder])

  if (loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-md mx-auto p-4 flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-600" />
            <p className="text-muted-foreground">Loading order...</p>
          </div>
        </div>
      </main>
    )
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-md mx-auto p-4">
          <header className="sticky top-0 z-10 bg-background border-b px-4 py-4">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
              <span>Back</span>
            </Link>
          </header>
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">{error || 'Order not found'}</h2>
            <p className="text-muted-foreground mb-6">We could not find this order.</p>
            <Button asChild>
              <Link href="/">Go to Home</Link>
            </Button>
          </div>
        </div>
      </main>
    )
  }

  const lalamoveTrackingUrl = order.lalamove_order_id 
    ? `https://www.lalamove.com/en-my/track/MY/${order.lalamove_order_id}`
    : null

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-md mx-auto">
        <header className="sticky top-0 z-10 bg-background border-b px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
              <span>Back</span>
            </Link>
            <h1 className="text-lg font-semibold">Order Tracking</h1>
            <button 
              onClick={() => { setRefreshing(true); fetchOrder() }}
              className="p-2 text-muted-foreground hover:text-foreground"
              disabled={refreshing}
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Order Status</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {order.id.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className={`p-2 rounded-full ${
                  order.status === 'delivered' ? 'bg-green-100' :
                  order.status === 'cancelled' ? 'bg-red-100' : 'bg-orange-100'
                }`}>
                  {order.status === 'delivered' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : order.status === 'cancelled' ? (
                    <Circle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Clock className="h-5 w-5 text-orange-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{STATUS_LABELS[order.status as OrderStatus] || order.status}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Paid</span>
                  <CheckCircle className={`h-4 w-4 ${
                    ['paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'].includes(order.status)
                      ? 'text-green-600' : 'text-muted'
                  }`} />
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-orange-600 transition-all duration-500"
                    style={{
                      width: order.status === 'delivered' ? '100%' :
                             order.status === 'picked_up' ? '75%' :
                             order.status === 'preparing' || order.status === 'ready' ? '50%' :
                             ['paid', 'accepted'].includes(order.status) ? '25%' : '0%'
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Paid</span>
                  <span>Preparing</span>
                  <span>On the way</span>
                  <span>Delivered</span>
                </div>
              </div>

              {lalamoveTrackingUrl && (
                <a
                  href={lalamoveTrackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full p-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  Track Delivery on Lalamove
                </a>
              )}

              {order.lalamove_status && (
                <p className="text-sm text-center text-muted-foreground">
                  Lalamove Status: {order.lalamove_status}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Bulk Order Status */}
          {order.order_kind === 'bulk' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Bulk Order Status</CardTitle>
              </CardHeader>
              <CardContent>
                {order.approval_status === 'pending_review' && (
                  <div className="p-4 bg-amber-50 rounded-lg">
                    <p className="font-medium text-amber-800">Your order is being reviewed</p>
                    <p className="text-sm text-amber-700 mt-1">
                      We&apos;ll update you within 24 hours. {order.bulk_company_name && `Order for: ${order.bulk_company_name}`}
                    </p>
                  </div>
                )}
                {order.approval_status === 'approved' && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="font-medium text-green-800">Your order has been approved!</p>
                    <p className="text-sm text-green-700 mt-1">
                      Please complete payment to confirm your order.
                    </p>
                    <Link href={`/checkout/success?order_id=${order.id}`} className="inline-block mt-3">
                      <Button size="sm">Pay Now</Button>
                    </Link>
                  </div>
                )}
                {order.approval_status === 'rejected' && (
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="font-medium text-red-800">Order was not approved</p>
                    {order.review_notes && (
                      <p className="text-sm text-red-700 mt-1">{order.review_notes}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-muted rounded flex items-center justify-center text-sm font-medium">
                      {item.quantity}x
                    </div>
                    <span>{item.menu_item_name}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatPrice(item.line_total_cents)}
                  </span>
                </div>
              ))}
              
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(order.total_cents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span>{formatPrice(order.delivery_fee_cents)}</span>
                </div>
                <div className="flex items-center justify-between font-medium">
                  <span>Total</span>
                  <span>{formatPrice(order.total_cents + order.delivery_fee_cents)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.delivery_address_json && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Delivery Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{(order.delivery_address_json as Record<string, string>).fullName}</p>
                <p className="text-muted-foreground">{(order.delivery_address_json as Record<string, string>).phone}</p>
                <p className="text-muted-foreground mt-2">
                  {(order.delivery_address_json as Record<string, string>).address}
                </p>
                <p className="text-muted-foreground">
                  {(order.delivery_address_json as Record<string, string>).postalCode}, {(order.delivery_address_json as Record<string, string>).city}, {(order.delivery_address_json as Record<string, string>).state}
                </p>
              </CardContent>
            </Card>
          )}

          {order.delivery_type === 'self_pickup' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Pickup</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Please pick up your order from our store.</p>
                {order.scheduled_for && (
                  <p className="font-medium mt-2">
                    Pickup at: {formatDate(order.scheduled_for)}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <DriverInfo 
            driver_name={order.driver_name}
            driver_phone={order.driver_phone}
            driver_plate_number={order.driver_plate_number}
          />
        </div>
      </div>
    </main>
  )
}
