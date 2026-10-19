'use client'

import { QuantitySelector } from './QuantitySelector'
import { ModifierGroup } from './ModifierGroup'
import { SpecialInstructions } from './SpecialInstructions'
import { ItemImagePreview } from './ItemImagePreview'
import { BackButton } from '@/components/layout/BackButton'
import { Button } from '@/components/ui/button'
import { useItemOrder } from './useItemOrder'
import { cn } from '@/lib/utils'
import type { FullMenuItem } from '@/lib/queries/menu'

interface ItemDetailClientProps {
  item: FullMenuItem
}

function formatPrice(priceCents: number): string {
  return (priceCents / 100).toFixed(2)
}

export function ItemDetailClient({ item }: ItemDetailClientProps) {
  const {
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
    isUnavailable,
  } = useItemOrder(item)

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
              <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.11em] text-ember-text">
                {item.category.name}
              </p>
              <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{item.name}</h1>
            </div>

            {isUnavailable && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm font-medium">
                This item is currently unavailable
              </div>
            )}

            {item.description && (
              <p className="mb-6 text-[15px] leading-6 text-muted-foreground">{item.description}</p>
            )}

            {item.modifier_groups.length > 0 && (
              <div className="space-y-[18px]">
                <h2 className="text-[15px] font-extrabold tracking-[-0.01em]">Customize Your Order</h2>
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

            <div className="flex items-center justify-between border-t py-4">
              <div>
                <p className="text-[13px] font-extrabold text-foreground">Quantity</p>
                <QuantitySelector quantity={quantity} onChange={setQuantity} disabled={isUnavailable} />
              </div>
            </div>

            <SpecialInstructions value={specialInstructions} onChange={setSpecialInstructions} disabled={isUnavailable} />

            {!allRequiredGroupsSatisfied && !isUnavailable && (
              <p className="text-sm text-destructive text-center">
                Please select required options: {unsatisfiedRequiredGroupNames.join(', ')}
              </p>
            )}
          </section>
        </div>
      </div>

      {/* Full-width fixed bottom bar — outside max-w-6xl, inside <main> */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {isUnavailable ? (
            <Button
              size="lg"
              disabled
              className="min-h-[54px] w-full cursor-not-allowed rounded-full bg-surface-2 text-muted-foreground"
            >
              Unavailable
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handlePrimaryAction}
              disabled={false}
              className={cn(
                "min-h-[54px] w-full rounded-full text-[15px] font-bold transition",
                allRequiredGroupsSatisfied
                  ? "bg-[image:var(--grad-cta)] text-white shadow-[0_14px_32px_-12px_var(--accent)] hover:brightness-110 active:translate-y-px"
                  : "border border-destructive bg-destructive/90 text-destructive-foreground"
              )}
            >
              {allRequiredGroupsSatisfied
                ? `add to basket - ${formatPrice(totalPriceCents)} (Incl. tax)`
                : `Select required options (${unsatisfiedRequiredGroupNames.length})`
                }
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
