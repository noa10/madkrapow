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
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-[15px] font-extrabold">
        Order Summary
      </h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold tabular-nums">{formatPrice(subtotal)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Delivery</span>
          <span className="text-sm text-muted-foreground">Calculated at checkout</span>
        </div>
      </div>

      {isBelowMinimum && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted-foreground">
          Minimum order: {formatPrice(minOrderAmount)}. Add {formatPrice(remainingForMinimum)} more to checkout.
        </p>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="font-bold">Total</span>
          <span className="text-xl font-extrabold tabular-nums text-ember-text">{formatPrice(subtotal)}</span>
        </div>
      </div>

      <Button
        className="min-h-[54px] w-full rounded-full bg-[image:var(--grad-cta)] text-[15px] font-bold text-white shadow-[0_14px_32px_-12px_var(--accent)] hover:brightness-110 active:translate-y-px"
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
