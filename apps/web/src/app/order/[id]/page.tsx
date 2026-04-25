'use client'

import { useEffect, useState, useCallback } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import {
  Package,
  MapPin,
  Clock,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  Circle,
  Loader2,
  Menu,
} from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { DriverInfo } from '@/components/order/DriverInfo'
import { DeliveryMap } from '@/components/order/DeliveryMap'
import { PageContainer } from '@/components/layout/PageContainer'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'

interface ShipmentData {
  id: string
  lalamove_order_id: string | null
  dispatch_status: string
  share_link: string | null
  service_type: string
  driver_name: string | null
  driver_phone: string | null
  driver_plate: string | null
  driver_photo_url: string | null
  driver_latitude: number | null
  driver_longitude: number | null
  driver_location_updated_at: string | null
  quoted_fee_cents: number | null
  actual_fee_cents: number | null
  created_at: string
  completed_at: string | null
  cancelled_at: string | null
}

interface OrderItemModifier {
  id: string
  order_item_id: string
  modifier_name: string
  modifier_price_delta_cents: number
}

interface OrderItem {
  id: string
  menu_item_name: string
  menu_item_price_cents: number
  quantity: number
  line_total_cents: number
  notes: string | null
  image_url?: string | null
  order_item_modifiers?: OrderItemModifier[]
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
  driver_latitude: number | null
  driver_longitude: number | null
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

const ORDER_STEPS: { key: string; label: string }[] = [
  { key: 'paid', label: 'Paid' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'picked_up', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
]

const TERMINAL_STATUSES = ['delivered', 'cancelled']

function getStepIndex(status: string): number {
  return ORDER_STEPS.findIndex((s) => s.key === status)
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
  const [shipment, setShipment] = useState<ShipmentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const fetchOrder = useCallback(async () => {
    try {
      const supabase = getBrowserClient()

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single()

      if (orderError || !orderData) {
        if (orderError?.code === 'PGRST301' || orderError?.message?.includes('row-level security')) {
          setError('Sign in to view this order')
        } else {
          setError('Order not found')
        }
        return
      }

      setOrder(orderData)

      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)

      if (!itemsError && itemsData) {
        const items = itemsData as OrderItem[]

        // Fetch modifiers for all items
        const itemIds = items.map((i) => i.id)
        if (itemIds.length > 0) {
          const { data: modifiersData } = await supabase
            .from('order_item_modifiers')
            .select('*')
            .in('order_item_id', itemIds)

          if (modifiersData) {
            const modifiersByItemId = new Map<string, OrderItemModifier[]>()
            for (const mod of modifiersData as OrderItemModifier[]) {
              const list = modifiersByItemId.get(mod.order_item_id) ?? []
              list.push(mod)
              modifiersByItemId.set(mod.order_item_id, list)
            }
            for (const item of items) {
              item.order_item_modifiers = modifiersByItemId.get(item.id) ?? []
            }
          }
        }

        setOrderItems(items)
      }

      // Fetch shipment data
      const { data: shipmentData } = await supabase
        .from('lalamove_shipments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (shipmentData) {
        setShipment(shipmentData)
      }
    } catch (err) {
      console.error('Failed to fetch order:', err)
      setError('Failed to load order')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orderId])

  // Check authentication state on mount
  useEffect(() => {
    async function checkAuth() {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      setIsAuthenticated(!!session)
      setAuthChecking(false)
    }
    checkAuth()
  }, [])

  // Fetch order only after auth is confirmed
  useEffect(() => {
    if (authChecking) return
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    fetchOrder()
  }, [fetchOrder, isAuthenticated, authChecking])

  // Realtime subscription: only after auth confirmed
  useEffect(() => {
    if (!orderId || !isAuthenticated || authChecking) return

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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lalamove_shipments',
          filter: `order_id=eq.${orderId}`
        },
        () => {
          console.log('Shipment updated')
          fetchOrder()
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscribed for order:', orderId)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime subscription issue:', status)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orderId, fetchOrder, isAuthenticated, authChecking])

  // Polling fallback: refresh every 5s while order has not reached a terminal status.
  // This runs alongside Realtime as a safety net — if Realtime fails or is delayed,
  // polling ensures the customer still sees status updates.
  useEffect(() => {
    if (!isAuthenticated || authChecking) return
    if (order?.status && TERMINAL_STATUSES.includes(order.status)) return

    const interval = setInterval(() => {
      fetchOrder()
    }, 5000)

    return () => clearInterval(interval)
  }, [order?.status, fetchOrder, isAuthenticated, authChecking])

  if (authChecking || loading) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar mobileOpen={false} onMobileClose={() => {}} />
        <main className="flex-1 flex items-center justify-center lg:ml-[260px] min-h-screen bg-background">
          <PageContainer size="narrow">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">{authChecking ? 'Checking session...' : 'Loading order...'}</p>
            </div>
          </PageContainer>
        </main>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar mobileOpen={false} onMobileClose={() => {}} />
        <main className="min-h-screen bg-background lg:ml-[260px]">
          <PageContainer size="narrow">
            <div className="py-8">
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">Sign in required</h2>
                <p className="text-muted-foreground mb-6 text-center">Please sign in to track your order.</p>
                <Button asChild>
                  <Link href="/auth?redirect=/order/{orderId}">Sign In</Link>
                </Button>
              </div>
            </div>
          </PageContainer>
        </main>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen bg-background">
        <DashboardSidebar mobileOpen={false} onMobileClose={() => {}} />
        <main className="min-h-screen bg-background lg:ml-[260px]">
          <PageContainer size="narrow">
            <div className="py-8">
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h2 className="text-xl font-semibold mb-2">{error || 'Order not found'}</h2>
                <p className="text-muted-foreground mb-6">We could not find this order.</p>
                <Button asChild>
                  <Link href="/">Go to Home</Link>
                </Button>
              </div>
            </div>
          </PageContainer>
        </main>
      </div>
    )
  }

  // Use shipment share_link for tracking, fallback to old lalamove URL
  const lalamoveTrackingUrl = shipment?.share_link
    || (order.lalamove_order_id
      ? `https://www.lalamove.com/en-my/track/MY/${order.lalamove_order_id}`
      : null)

  // Use shipment driver info if available, fallback to order
  const driverName = shipment?.driver_name || order.driver_name
  const driverPhone = shipment?.driver_phone || order.driver_phone
  const driverPlate = shipment?.driver_plate || order.driver_plate_number

  const isCancelled = order.status === 'cancelled'
  const isDelivered = order.status === 'delivered'
  const currentStepIndex = getStepIndex(order.status)

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      <main className="flex-1 lg:ml-[260px]">
        <PageContainer>
          <div className="py-6 md:py-10">
            {/* Page Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="lg:hidden rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <h1 className="text-2xl font-semibold font-display">Order Tracking</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Order #{order.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setRefreshing(true); fetchOrder() }}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                disabled={refreshing}
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left Column: Status & Map */}
            <div className="lg:col-span-3 space-y-6">
              {/* Order Status Card */}
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-lg font-semibold mb-5 font-display">Order Status</h2>

                {/* Current Status Badge */}
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-6">
                  <div className={`p-2 rounded-full ${
                    isDelivered ? 'bg-green-500/10' :
                    isCancelled ? 'bg-red-500/10' : 'bg-primary/10'
                  }`}>
                    {isDelivered ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : isCancelled ? (
                      <Circle className="h-5 w-5 text-red-500" />
                    ) : (
                      <Clock className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{STATUS_LABELS[order.status as OrderStatus] || order.status}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
                  </div>
                </div>

                {/* Status Steps */}
                {!isCancelled && (
                  <div className="space-y-0">
                    {ORDER_STEPS.map((step, index) => {
                      const isCompleted = currentStepIndex >= index
                      const isCurrent = currentStepIndex === index
                      return (
                        <div key={step.key} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                              isCompleted
                                ? 'bg-primary border-primary text-primary-foreground'
                                : isCurrent
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border bg-muted text-muted-foreground'
                            }`}>
                              {isCompleted ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : (
                                <span className="text-xs font-medium">{index + 1}</span>
                              )}
                            </div>
                            {index < ORDER_STEPS.length - 1 && (
                              <div className={`w-0.5 h-8 ${
                                isCompleted ? 'bg-primary' : 'bg-border'
                              }`} />
                            )}
                          </div>
                          <div className="pt-1.5">
                            <p className={`text-sm font-medium ${
                              isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                              {step.label}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {isCancelled && (
                  <div className="p-4 bg-red-500/10 rounded-lg">
                    <p className="font-medium text-red-400">This order has been cancelled.</p>
                  </div>
                )}

                {/* Lalamove Tracking Link */}
                {lalamoveTrackingUrl && (
                  <a
                    href={lalamoveTrackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full p-3 mt-5 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Track Delivery on Lalamove
                  </a>
                )}

                {order.lalamove_status && (
                  <p className="text-sm text-center text-muted-foreground mt-3">
                    Lalamove Status: {order.lalamove_status}
                  </p>
                )}
              </section>

              {/* Bulk Order Status */}
              {order.order_kind === 'bulk' && (
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="text-lg font-semibold mb-4 font-display">Bulk Order Status</h2>
                  {order.approval_status === 'pending_review' && (
                    <div className="p-4 bg-amber-500/10 rounded-lg">
                      <p className="font-medium text-amber-400">Your order is being reviewed</p>
                      <p className="text-sm text-amber-400/80 mt-1">
                        We&apos;ll update you within 24 hours. {order.bulk_company_name && `Order for: ${order.bulk_company_name}`}
                      </p>
                    </div>
                  )}
                  {order.approval_status === 'approved' && (
                    <div className="p-4 bg-green-500/10 rounded-lg">
                      <p className="font-medium text-green-400">Your order has been approved!</p>
                      <p className="text-sm text-green-400/80 mt-1">
                        Please complete payment to confirm your order.
                      </p>
                      <Link href={`/checkout/success?order_id=${order.id}`} className="inline-block mt-3">
                        <Button size="sm">Pay Now</Button>
                      </Link>
                    </div>
                  )}
                  {order.approval_status === 'rejected' && (
                    <div className="p-4 bg-red-500/10 rounded-lg">
                      <p className="font-medium text-red-400">Order was not approved</p>
                      {order.review_notes && (
                        <p className="text-sm text-red-400/80 mt-1">{order.review_notes}</p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Driver Info */}
              <DriverInfo
                driver_name={driverName}
                driver_phone={driverPhone}
                driver_plate_number={driverPlate}
              />

              {/* Live Driver Tracking Map */}
              <DeliveryMap
                driverLatitude={shipment?.driver_latitude ?? order.driver_latitude ?? null}
                driverLongitude={shipment?.driver_longitude ?? order.driver_longitude ?? null}
                deliveryLatitude={
                  order.delivery_address_json
                    ? (order.delivery_address_json as Record<string, number>).latitude ?? null
                    : null
                }
                deliveryLongitude={
                  order.delivery_address_json
                    ? (order.delivery_address_json as Record<string, number>).longitude ?? null
                    : null
                }
                driverName={driverName}
                orderStatus={order.status}
                deliveryType={order.delivery_type}
              />

              {/* Delivery Address / Pickup Info */}
              {order.delivery_address_json && (
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="text-lg font-semibold mb-3 font-display flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Delivery Address
                  </h2>
                  <p className="font-medium">{(order.delivery_address_json as Record<string, string>).fullName}</p>
                  <p className="text-muted-foreground text-sm">{(order.delivery_address_json as Record<string, string>).phone}</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    {(order.delivery_address_json as Record<string, string>).address}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {(order.delivery_address_json as Record<string, string>).postalCode}, {(order.delivery_address_json as Record<string, string>).city}, {(order.delivery_address_json as Record<string, string>).state}
                  </p>
                </section>
              )}

              {order.delivery_type === 'self_pickup' && (
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="text-lg font-semibold mb-3 font-display">Pickup</h2>
                  <p className="text-muted-foreground">Please pick up your order from our store.</p>
                  {order.scheduled_for && (
                    <p className="font-medium mt-2">
                      Pickup at: {formatDate(order.scheduled_for)}
                    </p>
                  )}
                </section>
              )}
            </div>

            {/* Right Column: Order Items */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="text-lg font-semibold mb-4 font-display">Order Details</h2>
                  <div className="space-y-3">
                    {orderItems.map((item) => (
                      <div key={item.id} className="text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            {item.image_url ? (
                              <Image
                                src={item.image_url}
                                alt={item.menu_item_name}
                                width={40}
                                height={40}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0">
                                {item.quantity}x
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="truncate block font-medium">{item.menu_item_name}</span>
                              <span className="text-xs text-muted-foreground">{formatPrice(item.menu_item_price_cents)} each</span>
                            </div>
                          </div>
                          <span className="font-medium flex-shrink-0 ml-2">
                            {formatPrice(item.line_total_cents)}
                          </span>
                        </div>
                        {/* Modifiers */}
                        {item.order_item_modifiers && item.order_item_modifiers.length > 0 && (
                          <div className="ml-[52px] mt-1 space-y-0.5">
                            {item.order_item_modifiers.map((mod) => (
                              <div key={mod.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span>+</span>
                                  {mod.modifier_name}
                                </span>
                                {mod.modifier_price_delta_cents > 0 && (
                                  <span>+ {formatPrice(mod.modifier_price_delta_cents)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Notes */}
                        {item.notes && (
                          <p className="ml-[52px] mt-1 text-xs text-muted-foreground italic">
                            Note: {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border mt-4 pt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatPrice(order.total_cents)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span>{formatPrice(order.delivery_fee_cents)}</span>
                    </div>
                    <div className="flex items-center justify-between font-semibold border-t border-border pt-2">
                      <span>Total</span>
                      <span className="text-primary">{formatPrice(order.total_cents + order.delivery_fee_cents)}</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
      </main>
    </div>
  )
}
