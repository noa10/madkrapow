'use client'

import { useMemo, useState } from 'react'
import { useStore } from 'zustand'
import type { SelectedModifier } from '@/stores/cart'
import { useCartStoreInstance } from '@/stores/cart-context'
import { useToastStore } from '@/stores/toast'
import type { FullMenuItem, Modifier } from '@/lib/queries/menu'
import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '@/lib/menu/quantity'
import { getUnsatisfiedRequiredGroupNames } from '@/lib/menu/required-options'

function formatPrice(priceCents: number): string {
  return (priceCents / 100).toFixed(2)
}

/** Quantity bounds shared by the item page and the quick-view dialog. */
export const MIN_QUANTITY = MIN_ITEM_QUANTITY
export const MAX_QUANTITY = MAX_ITEM_QUANTITY

/**
 * Ordering state for a single menu item — shared by the item detail page
 * and the menu quick-view dialog so pricing, required-option validation
 * and the cart payload can never drift apart between the two surfaces.
 */
export function useItemOrder(item: FullMenuItem) {
  const cart = useCartStoreInstance()
  const addItem = useStore(cart, (state) => state.addItem)
  const addToast = useToastStore((state) => state.addToast)

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

  const unsatisfiedRequiredGroupNames = useMemo(
    () => getUnsatisfiedRequiredGroupNames(item.modifier_groups, selectedModifierIds),
    [item.modifier_groups, selectedModifierIds]
  )

  const allRequiredGroupsSatisfied = unsatisfiedRequiredGroupNames.length === 0

  const handleModifierChange = (groupId: string, modifierIds: string[]) => {
    setSelectedModifierIds((prev) => ({
      ...prev,
      [groupId]: modifierIds,
    }))
  }

  const addToCart = () => {
    const selectedModifiers: SelectedModifier[] = []

    Object.values(selectedModifierIds).forEach((modifierIds) => {
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

    addToast({
      type: 'success',
      title: 'Added to cart',
      description: `${quantity}x ${item.name} — ${formatPrice(totalPriceCents)}`,
    })
  }

  /**
   * CTA handler: toasts and bails when required options are missing,
   * otherwise adds to the cart. Returns true only when the item was
   * actually added — lets the quick-view dialog close itself on success.
   */
  const handlePrimaryAction = (): boolean => {
    if (!allRequiredGroupsSatisfied) {
      addToast({
        type: 'error',
        title: 'Required options missing',
        description: `Please select: ${unsatisfiedRequiredGroupNames.join(', ')}`,
      })
      return false
    }
    addToCart()
    return true
  }

  return {
    quantity,
    setQuantity,
    specialInstructions,
    setSpecialInstructions,
    selectedModifierIds,
    handleModifierChange,
    allRequiredGroupsSatisfied,
    unsatisfiedRequiredGroupNames,
    totalPriceCents,
    handlePrimaryAction,
    isUnavailable: !item.is_available,
  }
}
