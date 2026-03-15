'use client'

import { Button } from '@/components/ui/button'
import { Minus, Plus } from 'lucide-react'

interface QuantitySelectorProps {
  quantity: number
  onChange: (quantity: number) => void
  min?: number
  max?: number
}

export function QuantitySelector({
  quantity,
  onChange,
  min = 1,
  max = 10,
}: QuantitySelectorProps) {
  const handleDecrease = () => {
    if (quantity > min) {
      onChange(quantity - 1)
    }
  }

  const handleIncrease = () => {
    if (quantity < max) {
      onChange(quantity + 1)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={handleDecrease}
        disabled={quantity <= min}
        aria-label="Decrease quantity"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <span className="w-8 text-center font-medium" aria-live="polite">
        {quantity}
      </span>
      <Button
        variant="outline"
        size="icon"
        onClick={handleIncrease}
        disabled={quantity >= max}
        aria-label="Increase quantity"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}
