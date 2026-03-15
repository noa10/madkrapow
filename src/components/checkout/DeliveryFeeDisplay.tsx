'use client'

import { MapPin, Truck, Clock, Bike } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useCheckoutStore, type DeliveryQuote } from '@/stores/checkout'

interface DeliveryFeeDisplayProps {
  isCalculating?: boolean
  quote?: DeliveryQuote | null
  distance?: string
  serviceType?: string
  eta?: string
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

function formatEta(eta: string): string {
  const minutes = parseInt(eta, 10)
  if (isNaN(minutes)) return eta
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`
}

function formatDistance(distance: string): string {
  const km = parseFloat(distance)
  if (isNaN(km)) return distance
  return `${km.toFixed(1)} km`
}

function getServiceTypeIcon(serviceType?: string) {
  const type = serviceType?.toUpperCase() || 'MOTORCYCLE'
  return type === 'VAN' ? <Truck className="h-4 w-4" /> : <Bike className="h-4 w-4" />
}

function getServiceTypeLabel(serviceType?: string): string {
  const type = serviceType?.toUpperCase() || 'MOTORCYCLE'
  return type === 'VAN' ? 'Van' : 'Motorcycle'
}

export function DeliveryFeeDisplay({
  isCalculating = false,
  quote,
  distance,
  serviceType,
  eta,
}: DeliveryFeeDisplayProps) {
  const deliveryQuote = useCheckoutStore((state) => state.delivery_quote)
  const activeQuote = quote || deliveryQuote

  const baseFee = activeQuote?.fees?.find((f) => f.fee_type === 'base')?.amount_cents ?? 0
  const distanceFee = activeQuote?.fees?.find((f) => f.fee_type === 'distance')?.amount_cents ?? 0
  const platformFee = activeQuote?.fees?.find((f) => f.fee_type === 'peak')?.amount_cents ?? 0
  const totalFee = activeQuote?.fee_cents ?? 0

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

  if (!activeQuote) {
    return null
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="space-y-2">
          {distance && (
            <div className="flex items-center text-sm">
              <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-muted-foreground">Distance:</span>
              <span className="ml-auto font-medium">{formatDistance(distance)}</span>
            </div>
          )}

          {serviceType && (
            <div className="flex items-center text-sm">
              {getServiceTypeIcon(serviceType)}
              <span className="ml-2 text-muted-foreground">Service:</span>
              <span className="ml-auto font-medium">{getServiceTypeLabel(serviceType)}</span>
            </div>
          )}

          {eta && (
            <div className="flex items-center text-sm">
              <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
              <span className="text-muted-foreground">Est. delivery:</span>
              <span className="ml-auto font-medium">{formatEta(eta)}</span>
            </div>
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Base fee</span>
            <span>{formatPrice(baseFee)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Distance fee</span>
            <span>{formatPrice(distanceFee)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Platform fee</span>
            <span>{formatPrice(platformFee)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Total</span>
            <span>{formatPrice(totalFee)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
