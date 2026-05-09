'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, Package, ArrowRight, Loader2, CreditCard, ExternalLink } from 'lucide-react'
import confetti from 'canvas-confetti'
import { useCartStore } from '@/stores/cart'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { OrderSuccessSkeleton } from '@/components/ui/PageSkeleton'
import { generateOrderDisplayCode } from '@/lib/utils/order-code'

type PaymentStatus = 'confirming' | 'confirmed' | 'timed_out' | 'verifying' | 'processing'

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
  image_url: string | null
  order_item_modifiers: OrderItemModifier[]
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const clearCart = useCartStore((state) => state.clear)

  const orderId = searchParams.get('orderId') || searchParams.get('order_id')
  const sessionId = searchParams.get('session_id')
  const estimatedDelivery = searchParams.get('delivery')

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('confirming')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [orderTotalCents, setOrderTotalCents] = useState(0)
  const [deliveryFeeCents, setDeliveryFeeCents] = useState(0)

  useEffect(() => {
    clearCart()
  }, [clearCart])

  // Fetch order details (items, totals) once we have an orderId
  useEffect(() => {
    if (!orderId) return

    const fetchOrderDetails = async () => {
      const supabase = getBrowserClient()

      const { data: orderData } = await supabase
        .from('orders')
        .select('total_cents, delivery_fee_cents')
        .eq('id', orderId)
        .single()

      if (orderData) {
        setOrderTotalCents(orderData.total_cents ?? 0)
        setDeliveryFeeCents(orderData.delivery_fee_cents ?? 0)
      }

      const { data: itemsData } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)

      if (itemsData) {
        const items = itemsData as OrderItem[]
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
    }

    fetchOrderDetails()
  }, [orderId])

  useEffect(() => {
    if (paymentStatus === 'confirmed') {
      const duration = 3000
      const end = Date.now() + duration
      const colors = ['#d2b07b', '#ffffff', '#22c55e']

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors,
          disableForReducedMotion: true,
        })
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors,
          disableForReducedMotion: true,
        })
        if (Date.now() < end) {
          requestAnimationFrame(frame)
        }
      }
      requestAnimationFrame(frame)
    }
  }, [paymentStatus])

  const checkStatus = useCallback(async (supabase: ReturnType<typeof getBrowserClient>, orderId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    return !error && data && data.status !== 'pending'
  }, [])

  // Fallback: verify payment directly with Stripe if webhook is delayed or failed
  // Returns the Stripe-side status string (e.g. 'paid', 'processing') or null on failure.
  const verifyWithStripe = useCallback(async (): Promise<string | null> => {
    if (!orderId || !sessionId) return null

    try {
      const response = await fetch('/api/checkout/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, sessionId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        console.warn('[SuccessPage] Verification failed:', data.error || response.status)
        return null
      }

      const data = await response.json()
      if (data.success) {
        console.log('[SuccessPage] Payment verified via API fallback:', data.status)
        return data.status as string
      }
      return null
    } catch (err) {
      console.error('[SuccessPage] Verification API error:', err)
      return null
    }
  }, [orderId, sessionId])

  // Poll order status until payment is confirmed or timeout
  useEffect(() => {
    if (!orderId) return

    const supabase = getBrowserClient()
    let intervalId: ReturnType<typeof setInterval> | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const poll = async () => {
      const isConfirmed = await checkStatus(supabase, orderId)
      if (cancelled) return
      if (isConfirmed) {
        setPaymentStatus('confirmed')
        if (intervalId) clearInterval(intervalId)
        if (timeoutId) clearTimeout(timeoutId)
      }
    }

    // Check immediately, then every 3 seconds
    poll()
    intervalId = setInterval(poll, 3000)

    // Timeout after 20 seconds — attempt Stripe verification fallback
    timeoutId = setTimeout(async () => {
      if (intervalId) clearInterval(intervalId)
      if (cancelled) return

      if (sessionId) {
        setPaymentStatus('verifying')
        const status = await verifyWithStripe()
        if (cancelled) return

        if (status === 'paid') {
          setPaymentStatus('confirmed')
        } else if (status === 'processing') {
          // Async payment (e.g. FPX) still pending bank confirmation.
          // Restart polling and extend timeout instead of showing timed-out.
          setPaymentStatus('processing')
          intervalId = setInterval(poll, 3000)
          timeoutId = setTimeout(async () => {
            if (intervalId) clearInterval(intervalId)
            if (!cancelled) setPaymentStatus('timed_out')
          }, 45000)
        } else {
          setPaymentStatus('timed_out')
        }
      } else {
        setPaymentStatus('timed_out')
      }
    }, 20000)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [orderId, checkStatus, verifyWithStripe, sessionId])

  return (
    <main className="min-h-screen bg-background">
      <PageContainer size="narrow">
        <div className="py-8 md:py-16">
          <div className="flex flex-col items-center justify-center py-8">
            {(paymentStatus === 'confirming' || paymentStatus === 'verifying') && (
              <>
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
                <h1 className="text-3xl font-semibold font-display mb-2">
                  {paymentStatus === 'verifying' ? 'Verifying Payment' : 'Confirming Payment'}
                </h1>
                <p className="text-muted-foreground text-center max-w-md">
                  {paymentStatus === 'verifying'
                    ? 'Webhook was delayed. Checking directly with Stripe...'
                    : 'Please wait while we confirm your payment. This usually takes a few seconds.'}
                </p>
              </>
            )}

            {paymentStatus === 'processing' && (
              <>
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
                <h1 className="text-3xl font-semibold font-display mb-2">Processing Payment</h1>
                <p className="text-muted-foreground text-center max-w-md">
                  Your bank is processing the payment. This may take a minute. Please do not close this page.
                </p>
              </>
            )}

            {paymentStatus === 'confirmed' && (
              <>
                <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6 animate-scale-in">
                  <CheckCircle className="h-10 w-10 text-green-500" />
                </div>
                <h1 className="text-3xl font-semibold font-display mb-2 animate-fade-in-up">
                  Payment Confirmed!
                </h1>
                <p className="text-muted-foreground text-center max-w-md animate-fade-in-up">
                  Your order has been placed successfully.
                </p>
              </>
            )}

            {paymentStatus === 'timed_out' && (
              <>
                <div className="h-20 w-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
                  <CreditCard className="h-10 w-10 text-amber-500" />
                </div>
                <h1 className="text-3xl font-semibold font-display mb-2">Payment Received</h1>
                <p className="text-muted-foreground text-center max-w-md">
                  Your payment is being processed. You can track your order status below.
                </p>
              </>
            )}
          </div>

          <div className="max-w-md mx-auto space-y-4 mt-4 animate-fade-in-up">
            {/* Order Code Card */}
            <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
              <h2 className="text-lg font-semibold font-display">Order Details</h2>

              {orderId && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Order Code</p>
                    <p className="font-semibold text-lg tracking-tight">
                      {generateOrderDisplayCode(orderId)}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground/60">
                      System ID: {orderId}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Delivery</p>
                  <p className="font-medium">
                    {estimatedDelivery || '30-45 minutes'}
                  </p>
                </div>
              </div>

              <div className="border-t border-primary/30 pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <ExternalLink className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Track Delivery</p>
                    <p className="font-medium text-sm">
                      {orderId ? (
                        <Link href={`/order/${orderId}`} className="text-primary hover:underline">
                          View live tracking
                        </Link>
                      ) : (
                        'Available once order is confirmed'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Order Items Summary */}
            {orderItems.length > 0 && (
              <div className="rounded-xl border bg-card p-6 space-y-4 shadow-sm">
                <h2 className="text-lg font-semibold font-display">Order Summary</h2>
                <div className="space-y-4">
                  {orderItems.map((item) => (
                    <div key={item.id} className="text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {item.image_url ? (
                            <Image
                              src={item.image_url}
                              alt={item.menu_item_name}
                              width={48}
                              height={48}
                              sizes="48px"
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {item.quantity}x
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{item.menu_item_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatPrice(item.menu_item_price_cents)} each
                            </p>
                          </div>
                        </div>
                        <span className="font-medium flex-shrink-0">
                          {formatPrice(item.line_total_cents)}
                        </span>
                      </div>
                      {/* Modifiers */}
                      {item.order_item_modifiers.length > 0 && (
                        <div className="ml-[60px] mt-1 space-y-0.5">
                          {item.order_item_modifiers.map((mod) => (
                            <div
                              key={mod.id}
                              className="flex items-center justify-between text-xs text-muted-foreground"
                            >
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
                        <p className="ml-[60px] mt-1 text-xs text-muted-foreground italic">
                          Note: {item.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <div className="border-t border-border mt-4 pt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(orderTotalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span>{formatPrice(deliveryFeeCents)}</span>
                  </div>
                  <div className="flex items-center justify-between font-semibold border-t border-border pt-2">
                    <span>Total</span>
                    <span className="text-primary">
                      {formatPrice(orderTotalCents + deliveryFeeCents)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <Button asChild className="w-full shadow-gold" size="lg">
                <Link href={orderId ? `/order/${orderId}` : '/'}>
                  Track Order
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link href="/">
                  Back to Home
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </PageContainer>
    </main>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background">
          <PageContainer size="narrow">
            <OrderSuccessSkeleton />
          </PageContainer>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
