'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, ShoppingBag } from 'lucide-react'
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

  const minOrderAmount = minOrderAmountProp ?? 2000
  const subtotal = propSubtotal ?? getSubtotal()
  const isEmpty = items.length === 0
  const isBelowMinimum = subtotal > 0 && subtotal < minOrderAmount
  const canCheckout = !isEmpty && !isBelowMinimum
  const remainingForMinimum = minOrderAmount - subtotal

  const handleCheckout = () => {
    router.push('/checkout')
  }

  return (
    <div className="border-t bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-xl font-semibold">{formatPrice(subtotal)}</span>
      </div>

      {isBelowMinimum && (
        <p className="text-sm text-muted-foreground">
          Minimum order: {formatPrice(minOrderAmount)}. Add {formatPrice(remainingForMinimum)} more to checkout.
        </p>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleCheckout}
        disabled={!canCheckout}
      >
        Checkout
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>

      {isEmpty && (
        <div className="text-center">
          <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Your cart is empty</p>
        </div>
      )}
    </div>
  )
}
