'use client'

import { Clock, Bike, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useCheckoutStore } from '@/stores/checkout'

interface DeliveryFeeDisplayProps {
  isCalculating?: boolean
  onRefreshQuote?: () => void
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

export function DeliveryFeeDisplay({
  isCalculating = false,
  onRefreshQuote,
}: DeliveryFeeDisplayProps) {
  const delivery_quote = useCheckoutStore((state) => state.delivery_quote)
  const price_breakdown = useCheckoutStore((state) => state.price_breakdown)
  const service_type = useCheckoutStore((state) => state.service_type)
  const isQuoteExpired = useCheckoutStore((state) => state.isQuoteExpired)

  const expired = isQuoteExpired()

  if (isCalculating) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <Clock className="h-4 w-4 animate-pulse" />
            <span>Calculating delivery fee...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!price_breakdown && !delivery_quote) {
    return null
  }

  const totalFeeCents = delivery_quote?.fee_cents ?? Math.round(parseFloat(price_breakdown?.total || '0') * 100)
  const currency = price_breakdown?.currency || 'MYR'

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        {/* Service type */}
        {service_type && (
          <div className="flex items-center text-sm">
            <Bike className="h-4 w-4 mr-2 text-muted-foreground" />
            <span className="text-muted-foreground">Service:</span>
            <span className="ml-auto font-medium">
              {service_type === 'CAR' ? 'Car' : 'Motorcycle'}
            </span>
          </div>
        )}

        {/* Quote expiry warning */}
        {expired && onRefreshQuote && (
          <div className="flex items-center justify-between p-2 bg-amber-500/10 rounded-lg text-sm">
            <span className="text-amber-600">Quote expired</span>
            <button
              onClick={onRefreshQuote}
              className="flex items-center gap-1 text-amber-600 hover:text-amber-700 font-medium"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        )}

        {/* Price breakdown */}
        <div className="border-t pt-3 space-y-2">
          {price_breakdown?.base && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Base fee</span>
              <span>{formatPrice(Math.round(parseFloat(price_breakdown.base) * 100))}</span>
            </div>
          )}
          {price_breakdown?.extraMileage && parseFloat(price_breakdown.extraMileage) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Distance fee</span>
              <span>{formatPrice(Math.round(parseFloat(price_breakdown.extraMileage) * 100))}</span>
            </div>
          )}
          {price_breakdown?.surcharge && parseFloat(price_breakdown.surcharge) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Surcharge</span>
              <span>{formatPrice(Math.round(parseFloat(price_breakdown.surcharge) * 100))}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Delivery ({currency})</span>
            <span>{formatPrice(totalFeeCents)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
