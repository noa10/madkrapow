'use client'

import { useState } from 'react'
import { Loader2, Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCartStore, type AppliedPromo } from '@/stores/cart'
import { useToastStore } from '@/stores/toast'

interface PromoCodeInputProps {
  subtotalCents: number
  deliveryFeeCents: number
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

export function PromoCodeInput({ subtotalCents, deliveryFeeCents }: PromoCodeInputProps) {
  const [code, setCode] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appliedPromos = useCartStore((state) => state.appliedPromos)
  const applyPromo = useCartStore((state) => state.applyPromo)
  const removePromo = useCartStore((state) => state.removePromo)
  const addToast = useToastStore((state) => state.addToast)

  const handleValidate = async () => {
    if (!code.trim()) return

    setIsValidating(true)
    setError(null)

    try {
      const res = await fetch('/api/checkout/validate-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          subtotalCents,
          deliveryFeeCents,
        }),
      })

      const data = await res.json()

      if (!data.valid) {
        setError(data.error || 'Invalid promo code')
        return
      }

      applyPromo({
        code: data.promoCode,
        description: data.description,
        scope: data.scope,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountCents: data.discountCents,
      })

      addToast({
        type: 'promo',
        title: 'Promo applied!',
        description: `${data.promoCode} — save ${formatPrice(data.discountCents)}`,
      })

      setCode('')
    } catch {
      setError('Unable to validate promo code')
      addToast({
        type: 'error',
        title: 'Something went wrong',
        description: 'Could not validate the promo code. Please try again.',
        action: { label: 'Retry', onClick: () => handleValidate() },
      })
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Promo code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleValidate()
            }}
            className="pl-9"
            disabled={isValidating}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleValidate}
          disabled={!code.trim() || isValidating}
        >
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Apply'
          )}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {appliedPromos.length > 0 && (
        <div className="space-y-2">
          {appliedPromos.map((promo) => (
            <PromoBadge key={promo.code} promo={promo} onRemove={() => removePromo(promo.code)} />
          ))}
        </div>
      )}
    </div>
  )
}

function PromoBadge({ promo, onRemove }: { promo: AppliedPromo; onRemove: () => void }) {
  const formatDiscount = (p: AppliedPromo) => {
    if (p.discountType === 'percentage') {
      return `${p.discountValue}% off`
    }
    return `RM ${(p.discountCents / 100).toFixed(2)} off`
  }

  const scopeLabel = (p: AppliedPromo) => p.scope === 'delivery' ? 'Delivery' : 'Order'

  return (
    <div className="flex items-center justify-between p-2 bg-primary/5 rounded-lg">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {scopeLabel(promo)}
        </Badge>
        <span className="text-sm font-medium">{promo.code}</span>
        <span className="text-xs text-muted-foreground">— {formatDiscount(promo)}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}
