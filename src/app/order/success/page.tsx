'use client'

import { useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Clock, Package, ArrowRight } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { Button } from '@/components/ui/button'

function SuccessContent() {
  const searchParams = useSearchParams()
  const clearCart = useCartStore((state) => state.clear)

  const orderId = searchParams.get('orderId')
  const estimatedDelivery = searchParams.get('delivery')

  useEffect(() => {
    clearCart()
  }, [clearCart])

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-md mx-auto">
        <header className="sticky top-0 z-10 bg-background border-b px-4 py-4">
          <h1 className="text-xl font-semibold">Order Confirmed</h1>
        </header>

        <div className="p-4 space-y-6">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Thank You!</h2>
            <p className="text-muted-foreground text-center">
              Your order has been placed successfully.
            </p>
          </div>

          <div className="space-y-4">
            {orderId && (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Order ID</p>
                    <p className="font-medium">{orderId}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Estimated Delivery</p>
                  <p className="font-medium">
                    {estimatedDelivery || '30-45 minutes'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
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
    </main>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background">
          <div className="max-w-md mx-auto p-4 flex items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  )
}
