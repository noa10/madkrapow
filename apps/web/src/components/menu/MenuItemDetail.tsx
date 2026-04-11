'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { QuantitySelector } from './QuantitySelector'
import { ModifierGroup } from './ModifierGroup'
import { SpecialInstructions } from './SpecialInstructions'
import { Button } from '@/components/ui/button'
import { useCartStore, type SelectedModifier } from '@/stores/cart'
import type { FullMenuItem, Modifier } from '@/lib/queries/menu'

interface MenuItemDetailProps {
  item: FullMenuItem
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

export function MenuItemDetail({ item }: MenuItemDetailProps) {
  const router = useRouter()
  const addItem = useCartStore((state) => state.addItem)

  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [selectedModifierIds, setSelectedModifierIds] = useState<Record<string, string[]>>({})

  const allModifiers = useMemo(() => {
    const modifiers: Modifier[] = []
    item.modifier_groups.forEach((group) => {
      group.modifiers.forEach((mod) => {
        modifiers.push(mod)
      })
    })
    return modifiers
  }, [item.modifier_groups])

  const modifierTotalCents = useMemo(() => {
    let total = 0
    Object.values(selectedModifierIds).forEach((ids) => {
      ids.forEach((id) => {
        const modifier = allModifiers.find((m) => m.id === id)
        if (modifier) {
          total += modifier.price_delta_cents
        }
      })
    })
    return total
  }, [selectedModifierIds, allModifiers])

  const totalPriceCents = (item.price_cents + modifierTotalCents) * quantity

  const allRequiredGroupsSatisfied = useMemo(() => {
    return item.modifier_groups.every((group) => {
      if (!group.is_required) return true
      const selected = selectedModifierIds[group.id] || []
      return selected.length >= group.min_selections
    })
  }, [item.modifier_groups, selectedModifierIds])

  const handleModifierChange = (groupId: string, modifierIds: string[], _priceDelta: number) => {
    setSelectedModifierIds((prev) => ({
      ...prev,
      [groupId]: modifierIds,
    }))
  }

  const handleAddToCart = () => {
    const selectedModifiers: SelectedModifier[] = []

    Object.entries(selectedModifierIds).forEach(([_groupId, modifierIds]) => {
      modifierIds.forEach((id) => {
        const modifier = allModifiers.find((m) => m.id === id)
        if (modifier) {
          selectedModifiers.push({
            id: modifier.id,
            name: modifier.name,
            price_delta_cents: modifier.price_delta_cents,
          })
        }
      })
    })

    addItem({
      menu_item_id: item.id,
      quantity,
      selected_modifiers: selectedModifiers,
      special_instructions: specialInstructions,
      unit_price: item.price_cents,
    })

    router.back()
  }

  return (
    <div className="space-y-6">
      {item.modifier_groups.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Customize Your Order</h2>
          {item.modifier_groups.map((group) => (
            <ModifierGroup
              key={group.id}
              group={group}
              selectedModifiers={selectedModifierIds[group.id] || []}
              onChange={(ids, priceDelta) => handleModifierChange(group.id, ids, priceDelta)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between py-4 border-t">
        <div>
          <p className="text-sm text-muted-foreground">Quantity</p>
          <QuantitySelector quantity={quantity} onChange={setQuantity} />
        </div>
      </div>

      <SpecialInstructions value={specialInstructions} onChange={setSpecialInstructions} />

      <div className="flex items-center justify-between py-4 border-t">
        <div>
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold text-orange-600">
            {formatPrice(totalPriceCents)}
          </p>
        </div>
        <Button
          size="lg"
          onClick={handleAddToCart}
          disabled={!allRequiredGroupsSatisfied}
          className="bg-orange-600 hover:bg-orange-700"
        >
          Add to Cart
        </Button>
      </div>

      {!allRequiredGroupsSatisfied && (
        <p className="text-sm text-destructive text-center">
          Please select all required options
        </p>
      )}
    </div>
  )
}
