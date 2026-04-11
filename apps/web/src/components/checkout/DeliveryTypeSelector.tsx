'use client'

import { Truck, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCheckoutStore } from '@/stores/checkout'

interface DeliveryTypeSelectorProps {
  pickupEnabled?: boolean
}

export function DeliveryTypeSelector({ pickupEnabled = true }: DeliveryTypeSelectorProps) {
  const deliveryType = useCheckoutStore((state) => state.delivery_type)
  const setDeliveryType = useCheckoutStore((state) => state.setDeliveryType)

  if (!pickupEnabled) return null

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">How do you want it?</h2>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant={deliveryType === 'delivery' ? 'default' : 'outline'}
          className="h-auto py-4 flex-col gap-2"
          onClick={() => setDeliveryType('delivery')}
        >
          <Truck className="h-5 w-5" />
          <span className="text-sm font-medium">Delivery</span>
        </Button>
        <Button
          variant={deliveryType === 'self_pickup' ? 'default' : 'outline'}
          className="h-auto py-4 flex-col gap-2"
          onClick={() => setDeliveryType('self_pickup')}
        >
          <Store className="h-5 w-5" />
          <span className="text-sm font-medium">Pickup</span>
        </Button>
      </div>
      {deliveryType === 'self_pickup' && (
        <p className="text-sm text-muted-foreground mt-2">
          Pick up your order at our store. No delivery fee.
        </p>
      )}
    </div>
  )
}
