'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCartStore } from '@/stores/cart'

interface CartSummaryProps {
  minOrderAmount?: number
  subtotal?: number
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

export function CartSummary({ minOrderAmount: minOrderAmountProp, subtotal: propSubtotal }: CartSummaryProps) {
  const router = useRouter()
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const closeDrawer = useCartStore((state) => state.closeDrawer)

  const minOrderAmount = minOrderAmountProp ?? 2000
  const subtotal = propSubtotal ?? getSubtotal()
  const isEmpty = items.length === 0
  const isBelowMinimum = subtotal > 0 && subtotal < minOrderAmount
  const canCheckout = !isEmpty && !isBelowMinimum
  const remainingForMinimum = minOrderAmount - subtotal

  const handleCheckout = () => {
    closeDrawer()
    router.push('/checkout')
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <h2 className="text-lg font-semibold font-display">Order Summary</h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatPrice(subtotal)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Delivery</span>
          <span className="text-sm text-muted-foreground">Calculated at checkout</span>
        </div>
      </div>

      {isBelowMinimum && (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
          Minimum order: {formatPrice(minOrderAmount)}. Add {formatPrice(remainingForMinimum)} more to checkout.
        </p>
      )}

      <div className="border-t border-primary/30 pt-4 mt-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Total</span>
          <span className="text-xl font-bold text-primary">{formatPrice(subtotal)}</span>
        </div>
      </div>

      <Button
        className="w-full shadow-gold"
        size="lg"
        onClick={handleCheckout}
        disabled={!canCheckout}
      >
        Checkout
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  )
}
