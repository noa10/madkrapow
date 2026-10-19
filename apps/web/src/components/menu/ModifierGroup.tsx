'use client'

import { Box, CupSoda, Flame, Leaf, Scale, SlidersHorizontal } from 'lucide-react'
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

function iconForGroup(name: string) {
  const n = name.toLowerCase()
  if (n.includes('pedas') || n.includes('spice')) return { Icon: Flame, filled: true }
  if (n.includes('minuman') || n.includes('drink')) return { Icon: CupSoda, filled: false }
  if (n.includes('basil') || n.includes('daun')) return { Icon: Leaf, filled: false }
  if (n.includes('berat') || n.includes('portion')) return { Icon: Scale, filled: false }
  if (n.includes('bekas') || n.includes('container')) return { Icon: Box, filled: false }
  return { Icon: SlidersHorizontal, filled: false }
}

export function ModifierGroup({
  group,
  selectedModifiers,
  onChange,
}: ModifierGroupProps) {
  const isSingleSelection = group.max_selections === 1
  const isRequired = group.min_selections > 0
  const { Icon: GroupIcon, filled } = iconForGroup(group.name)

  const scopeLabel = isSingleSelection
    ? '1 choice'
    : group.max_selections > 1
      ? `Up to ${group.max_selections} choices`
      : null
  const tag = [isRequired ? 'Required' : 'Optional', scopeLabel].filter(Boolean).join(' · ')

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
    <div className="flex flex-col gap-2.5">
      <p className="flex items-center gap-2 text-[13px] font-extrabold text-foreground">
        <GroupIcon className={cn('h-4 w-4 text-ember', filled && 'fill-ember/30')} aria-hidden />
        {group.name}
        <small className="ml-auto text-[11px] font-semibold text-muted-foreground">{tag}</small>
      </p>

      <div className="flex flex-col gap-2">
        {group.modifiers.map((modifier) => {
          const isSelected = selectedModifiers.includes(modifier.id)
          const priceDeltaStr = formatPriceDelta(modifier.price_delta_cents)

          return (
            <label
              key={modifier.id}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-border-2 bg-surface-2 px-3.5 py-2.5 transition-colors hover:bg-surface-3',
                isSelected && 'border-primary bg-accent/16 hover:bg-accent/16'
              )}
            >
              <input
                type={isSingleSelection ? 'radio' : 'checkbox'}
                name={isSingleSelection ? group.id : undefined}
                value={modifier.id}
                checked={isSelected}
                onChange={() => handleModifierToggle(modifier.id, modifier.price_delta_cents)}
                className="h-[18px] w-[18px] flex-none accent-primary"
              />
              <span className="text-[13px] font-bold text-foreground">{modifier.name}</span>
              {priceDeltaStr ? (
                <span className="ml-auto text-[11px] font-bold text-sesame">{priceDeltaStr}</span>
              ) : modifier.is_default ? (
                <span className="ml-auto text-[11px] font-bold text-sesame">Default</span>
              ) : null}
            </label>
          )
        })}
      </div>
    </div>
  )
}
