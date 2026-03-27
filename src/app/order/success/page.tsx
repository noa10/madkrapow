'use client'

import { useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, Package, ArrowRight } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { Button } from '@/components/ui/button'
import { PageContainer } from '@/components/layout/PageContainer'

function SuccessContent() {
  const searchParams = useSearchParams()
  const clearCart = useCartStore((state) => state.clear)

  const orderId = searchParams.get('orderId') || searchParams.get('order_id')
  const estimatedDelivery = searchParams.get('delivery')

  useEffect(() => {
    clearCart()
  }, [clearCart])

  return (
    <main className="min-h-screen bg-background">
      <PageContainer size="narrow">
        <div className="py-8 md:py-16">
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <h1 className="text-3xl font-semibold font-display mb-2">Thank You!</h1>
            <p className="text-muted-foreground text-center max-w-md">
              Your order has been placed successfully. We&apos;re preparing your food now.
            </p>
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
