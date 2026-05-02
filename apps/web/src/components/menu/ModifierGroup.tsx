'use client'

import { cn } from '@/lib/utils'
import type { Modifier, ModifierGroup } from '@/lib/queries/menu'

interface ModifierGroupProps {
  group: ModifierGroup & { is_required: boolean; modifiers: Modifier[] }
  selectedModifiers: string[]
  onChange: (modifierIds: string[], totalPriceDelta: number) => void
}

function formatPriceDelta(priceCents: number): string {
  if (priceCents <= 0) return ''
  return `+RM ${(priceCents / 100).toFixed(2)}`
}

export function ModifierGroup({
  group,
  selectedModifiers,
  onChange,
}: ModifierGroupProps) {
  const isSingleSelection = group.max_selections === 1
  const isRequired = group.min_selections > 0

  const handleModifierToggle = (modifierId: string, _priceDelta: number) => {
    let newSelected: string[]

    if (isSingleSelection) {
      newSelected = selectedModifiers.includes(modifierId) ? [] : [modifierId]
    } else {
      if (selectedModifiers.includes(modifierId)) {
        newSelected = selectedModifiers.filter((id) => id !== modifierId)
      } else {
        if (group.max_selections && selectedModifiers.length >= group.max_selections) {
          return
        }
        newSelected = [...selectedModifiers, modifierId]
      }
    }

    const totalPriceDelta = group.modifiers
      .filter((m) => newSelected.includes(m.id))
      .reduce((sum, m) => sum + m.price_delta_cents, 0)

    onChange(newSelected, totalPriceDelta)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-foreground">{group.name}</h3>
        {isRequired && (
          <span className="text-xs text-destructive">(Required)</span>
        )}
        {group.max_selections > 1 && (
          <span className="text-xs text-muted-foreground">
            (Select up to {group.max_selections})
          </span>
        )}
      </div>

      <div className="space-y-2">
        {group.modifiers.map((modifier) => {
          const isSelected = selectedModifiers.includes(modifier.id)
          const priceDeltaStr = formatPriceDelta(modifier.price_delta_cents)

          if (isSingleSelection) {
            return (
              <label
                key={modifier.id}
                className={cn(
                  'flex items-center gap-3 p-3 min-h-11 rounded-md border cursor-pointer',
                  'hover:bg-muted/50 transition-colors',
                  isSelected && 'border-primary ring-1 ring-primary bg-primary/5'
                )}
              >
                <input
                  type="radio"
                  name={group.id}
                  value={modifier.id}
                  checked={isSelected}
                  onChange={() => handleModifierToggle(modifier.id, modifier.price_delta_cents)}
                  className="w-4 h-4 text-primary accent-primary"
                />
                <span className="flex-1 text-foreground">{modifier.name}</span>
                {priceDeltaStr && (
                  <span className="text-sm text-muted-foreground">{priceDeltaStr}</span>
                )}
              </label>
            )
          }

          return (
            <label
              key={modifier.id}
              className={cn(
                'flex items-center gap-3 p-3 min-h-11 rounded-md border cursor-pointer',
                'hover:bg-muted/50 transition-colors',
                isSelected && 'border-primary ring-1 ring-primary bg-primary/5'
              )}
            >
              <input
                type="checkbox"
                value={modifier.id}
                checked={isSelected}
                onChange={() => handleModifierToggle(modifier.id, modifier.price_delta_cents)}
                className="w-4 h-4 text-primary accent-primary rounded"
              />
              <span className="flex-1 text-foreground">{modifier.name}</span>
              {priceDeltaStr && (
                <span className="text-sm text-muted-foreground">{priceDeltaStr}</span>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
