'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, Package, ArrowRight, Loader2, CreditCard } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/layout/PageContainer'

type PaymentStatus = 'confirming' | 'confirmed' | 'timed_out'

function SuccessContent() {
  const searchParams = useSearchParams()
  const clearCart = useCartStore((state) => state.clear)

  const orderId = searchParams.get('orderId') || searchParams.get('order_id')
  const estimatedDelivery = searchParams.get('delivery')

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('confirming')

  useEffect(() => {
    clearCart()
  }, [clearCart])

  const checkStatus = useCallback(async (supabase: ReturnType<typeof getBrowserClient>, orderId: string) => {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single()

    return !error && data && data.status !== 'pending'
  }, [])

  // Poll order status until payment is confirmed or timeout
  useEffect(() => {
    if (!orderId) return

    const supabase = getBrowserClient()
    let intervalId: ReturnType<typeof setInterval> | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      const isConfirmed = await checkStatus(supabase, orderId)
      if (isConfirmed) {
        setPaymentStatus('confirmed')
        if (intervalId) clearInterval(intervalId)
        if (timeoutId) clearTimeout(timeoutId)
      }
    }

    // Check immediately, then every 3 seconds
    poll()
    intervalId = setInterval(poll, 3000)

    // Timeout after 20 seconds — stop spinner, let user proceed
    timeoutId = setTimeout(() => {
      if (intervalId) clearInterval(intervalId)
      setPaymentStatus('timed_out')
    }, 20000)

    return () => {
      if (intervalId) clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [orderId, checkStatus])

  return (
    <main className="min-h-screen bg-background">
      <PageContainer size="narrow">
        <div className="py-8 md:py-16">
          <div className="flex flex-col items-center justify-center py-8">
            {paymentStatus === 'confirming' && (
              <>
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
                <h1 className="text-3xl font-semibold font-display mb-2">Confirming Payment</h1>
                <p className="text-muted-foreground text-center max-w-md">
                  Please wait while we confirm your payment. This usually takes a few seconds.
                </p>
              </>
            )}

            {paymentStatus === 'confirmed' && (
              <>
                <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
                  <CheckCircle className="h-10 w-10 text-green-500" />
                </div>
                <h1 className="text-3xl font-semibold font-display mb-2">Payment Confirmed!</h1>
                <p className="text-muted-foreground text-center max-w-md">
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

          <div className="max-w-md mx-auto space-y-4 mt-4">
            <div className="rounded-lg border bg-card p-4 space-y-4">
              {orderId && (
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Order ID</p>
                    <p className="font-medium">{orderId}</p>
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
            </div>

            <div className="space-y-3 pt-2">
              <Button asChild className="w-full" size="lg">
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
            <div className="flex items-center justify-center py-20">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          </PageContainer>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
