'use client'

import { Zap, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCheckoutStore } from '@/stores/checkout'

export function FulfillmentSelector() {
  const fulfillmentType = useCheckoutStore((state) => state.fulfillment_type)
  const setFulfillmentType = useCheckoutStore((state) => state.setFulfillmentType)

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">When?</h2>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant={fulfillmentType === 'asap' ? 'default' : 'outline'}
          className="h-auto py-4 flex-col gap-2"
          onClick={() => setFulfillmentType('asap')}
        >
          <Zap className="h-5 w-5" />
          <span className="text-sm font-medium">ASAP</span>
        </Button>
        <Button
          variant={fulfillmentType === 'scheduled' ? 'default' : 'outline'}
          className="h-auto py-4 flex-col gap-2"
          onClick={() => setFulfillmentType('scheduled')}
        >
          <Calendar className="h-5 w-5" />
          <span className="text-sm font-medium">Schedule</span>
        </Button>
      </div>
      {fulfillmentType === 'asap' && (
        <p className="text-sm text-muted-foreground mt-2">
          We&apos;ll start preparing right away.
        </p>
      )}
    </div>
  )
}
