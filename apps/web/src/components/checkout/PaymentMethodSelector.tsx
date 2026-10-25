'use client'

import { CreditCard, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentMethod, PaymentMethodOption } from '@/lib/payments/methods'

const ICONS: Record<PaymentMethod, typeof CreditCard> = {
  stripe: CreditCard,
  billplz: Landmark,
}

interface PaymentMethodSelectorProps {
  options: readonly PaymentMethodOption[]
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
  disabled?: boolean
}

/**
 * Radio-card selector for the checkout payment step. Native radio inputs keep
 * keyboard and screen-reader behaviour, while the card styling carries the
 * visual selection state.
 */
export function PaymentMethodSelector({
  options,
  value,
  onChange,
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Payment method" className="space-y-2">
      {options.map((option) => {
        const Icon = ICONS[option.id] ?? CreditCard
        const checked = option.id === value

        return (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              checked
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name="payment-method"
              value={option.id}
              checked={checked}
              onChange={() => onChange(option.id)}
              disabled={disabled}
              className="sr-only"
            />
            <Icon
              className={cn(
                'mt-0.5 h-5 w-5 shrink-0',
                checked ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">
                {option.description}
              </span>
            </span>
            <span
              className={cn(
                'mt-1 h-4 w-4 shrink-0 rounded-full border',
                checked
                  ? 'border-primary bg-primary ring-2 ring-primary/30'
                  : 'border-muted-foreground/40',
              )}
              aria-hidden
            />
          </label>
        )
      })}
    </div>
  )
}
