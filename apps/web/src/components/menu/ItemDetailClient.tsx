'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { QuantitySelector } from './QuantitySelector'
import { ModifierGroup } from './ModifierGroup'
import { SpecialInstructions } from './SpecialInstructions'
import { ItemImagePreview } from './ItemImagePreview'
import { BackButton } from '@/components/layout/BackButton'
import { Button } from '@/components/ui/button'
import { useCartStore, type SelectedModifier } from '@/stores/cart'
import { useToastStore } from '@/stores/toast'
import { cn } from '@/lib/utils'
import type { FullMenuItem, Modifier } from '@/lib/queries/menu'

interface ItemDetailClientProps {
  item: FullMenuItem
}

function formatPrice(priceCents: number): string {
  return (priceCents / 100).toFixed(2)
}

export function ItemDetailClient({ item }: ItemDetailClientProps) {
  const router = useRouter()
  const addItem = useCartStore((state) => state.addItem)
  const openDrawer = useCartStore((state) => state.openDrawer)
  const addToast = useToastStore((state) => state.addToast)

  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [selectedModifierIds, setSelectedModifierIds] = useState<Record<string, string[]>>({})
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar:client') === 'true'
    }
    return false
  })

  useEffect(() => {
    const handler = (e: Event) => {
      setSidebarCollapsed((e as CustomEvent).detail.collapsed)
    }
    window.addEventListener('sidebar-toggle', handler)
    return () => window.removeEventListener('sidebar-toggle', handler)
  }, [])

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

    addToast({
      type: 'success',
      title: 'Added to cart',
      description: `${quantity}x ${item.name} — ${formatPrice(totalPriceCents)}`,
    })
    openDrawer()
    router.back()
  }

  const isUnavailable = !item.is_available

  return (
    <div className={cn("min-h-screen bg-background pb-28", isUnavailable && "opacity-75")}>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <BackButton />
        <div className="grid gap-6 lg:grid-cols-[minmax(300px,420px)_1fr] lg:items-start">
          <aside className="lg:sticky lg:top-6">
            <ItemImagePreview imageUrl={item.image_url} itemName={item.name} />
          </aside>

          <section className="rounded-2xl border bg-card p-5 sm:p-6 animate-fade-in-up" data-testid="item-detail-content-panel">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-1">{item.category.name}</p>
              <h1 className="text-3xl font-bold">{item.name}</h1>
            </div>

            {isUnavailable && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm font-medium">
                This item is currently unavailable
              </div>
            )}

            {item.description && (
              <p className="text-muted-foreground mb-6">{item.description}</p>
            )}

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
                <QuantitySelector quantity={quantity} onChange={setQuantity} disabled={isUnavailable} />
              </div>
            </div>

            <SpecialInstructions value={specialInstructions} onChange={setSpecialInstructions} disabled={isUnavailable} />

            {!allRequiredGroupsSatisfied && !isUnavailable && (
              <p className="text-sm text-destructive text-center">
                Please select all required options
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Full-width fixed bottom bar — outside max-w-6xl, inside <main> */}
      <div
        className={cn(
          "fixed bottom-0 right-0 left-0 border-t bg-card/95 backdrop-blur-sm p-4 z-30 transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "lg:left-[72px]" : "lg:left-[260px]"
        )}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {isUnavailable ? (
            <Button
              size="lg"
              disabled
              className="w-full bg-muted text-muted-foreground cursor-not-allowed"
            >
              Unavailable
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleAddToCart}
              disabled={!allRequiredGroupsSatisfied}
              className="w-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
            >
              add to basket - {formatPrice(totalPriceCents)} (Incl. tax)
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
