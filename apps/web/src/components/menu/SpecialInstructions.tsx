'use client'

import { cn } from '@/lib/utils'

interface SpecialInstructionsProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

const MAX_LENGTH = 200

export function SpecialInstructions({ value, onChange, disabled }: SpecialInstructionsProps) {
  const remaining = MAX_LENGTH - value.length

  return (
    <div className="space-y-2">
      <label
        htmlFor="special-instructions"
        className="text-sm font-medium text-foreground"
      >
        Special Instructions
      </label>
      <textarea
        id="special-instructions"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={disabled ? "Unavailable" : "E.g., No onions, extra spicy..."}
        maxLength={MAX_LENGTH}
        rows={3}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 rounded-md border bg-background text-foreground',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          'resize-none',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
        aria-describedby="char-counter"
      />
      <p
        id="char-counter"
        className={cn(
          'text-xs text-muted-foreground',
          remaining <= 20 && 'text-destructive'
        )}
        role="status"
        aria-live="polite"
      >
        {remaining} characters remaining
      </p>
    </div>
  )
}