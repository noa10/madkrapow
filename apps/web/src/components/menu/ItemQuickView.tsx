'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { ItemImagePreview } from './ItemImagePreview'
import { ModifierGroup } from './ModifierGroup'
import { SpecialInstructions } from './SpecialInstructions'
import { useItemOrder } from './useItemOrder'
import { cn } from '@/lib/utils'
import type { FullMenuItem } from '@/lib/queries/menu'

interface ItemQuickViewProps {
  item: FullMenuItem
  onClose: () => void
}

const MIN_QUANTITY = 1
const MAX_QUANTITY = 10

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

/**
 * Menu quick-view dialog (owner.com style): full-bleed photo with a floating
 * close button, name + description, stepper modifier rows and a footer with
 * the quantity stepper + "Add item" CTA. Portaled to <body> at z-[35] —
 * above the topbar (z-30) and the sticky category rails (z-20), below the
 * cart drawer (z-40/50), the image zoom lightbox (z-[70]) and toasts (z-60).
 */
export function ItemQuickView({ item, onClose }: ItemQuickViewProps) {
  const order = useItemOrder(item)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useBodyScrollLock(true)

  useEffect(() => {
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // When the image zoom lightbox is open on top, Esc belongs to it.
      if (document.querySelector('[data-testid="item-image-modal"]')) return
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleAddToCart = () => {
    if (order.handlePrimaryAction()) {
      onClose()
    }
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[35] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
      data-testid="item-quick-view"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} options`}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-2xl outline-none sm:max-h-[88vh] sm:rounded-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close item view"
          className="absolute right-4 top-4 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-white text-neutral-800 shadow-md transition hover:bg-neutral-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <ItemImagePreview imageUrl={item.image_url} itemName={item.name} variant="banner" />

          <div className="px-5 py-5 sm:px-6">
            <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-foreground">
              {item.name}
            </h2>

            {order.isUnavailable && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                This item is currently unavailable
              </div>
            )}

            {item.description && (
              <p className="mt-2.5 text-[15px] leading-6 text-muted-foreground">{item.description}</p>
            )}

            {item.modifier_groups.length > 0 && (
              <div className="mt-5 space-y-5 border-t border-border pt-5">
                {item.modifier_groups.map((group) => (
                  <ModifierGroup
                    key={group.id}
                    group={group}
                    selectedModifiers={order.selectedModifierIds[group.id] || []}
                    onChange={(ids, priceDelta) => order.handleModifierChange(group.id, ids, priceDelta)}
                  />
                ))}
              </div>
            )}

            <div className="mt-5 border-t border-border pt-5">
              <SpecialInstructions
                value={order.specialInstructions}
                onChange={order.setSpecialInstructions}
                disabled={order.isUnavailable}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-surface px-5 py-3.5 sm:px-6">
          <div
            className={cn(
              'inline-flex h-12 flex-none items-center overflow-hidden rounded-lg border border-border-2',
              order.isUnavailable && 'opacity-50'
            )}
          >
            <button
              type="button"
              onClick={() => order.setQuantity(Math.max(MIN_QUANTITY, order.quantity - 1))}
              disabled={order.isUnavailable || order.quantity <= MIN_QUANTITY}
              aria-label="Decrease quantity"
              className="grid h-full w-11 cursor-pointer place-items-center text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums text-foreground">
              {order.quantity}
            </span>
            <button
              type="button"
              onClick={() => order.setQuantity(Math.min(MAX_QUANTITY, order.quantity + 1))}
              disabled={order.isUnavailable || order.quantity >= MAX_QUANTITY}
              aria-label="Increase quantity"
              className="grid h-full w-11 cursor-pointer place-items-center text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {order.isUnavailable ? (
            <Button
              size="lg"
              disabled
              className="h-12 flex-1 cursor-not-allowed rounded-lg bg-surface-2 text-muted-foreground"
            >
              Unavailable
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleAddToCart}
              className="h-12 min-w-0 flex-1 justify-between gap-2 rounded-lg bg-primary px-5 text-[15px] font-bold text-primary-foreground shadow-none transition hover:bg-[var(--accent-hover)] active:translate-y-px"
            >
              <span
                className="min-w-0 truncate"
                title={
                  order.allRequiredGroupsSatisfied
                    ? undefined
                    : order.unsatisfiedRequiredGroupNames.join(', ')
                }
              >
                {order.allRequiredGroupsSatisfied
                  ? 'Add item'
                  : `Select required options (${order.unsatisfiedRequiredGroupNames.length})`}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {order.allRequiredGroupsSatisfied && (
                  <span className="tabular-nums">{formatPrice(order.totalPriceCents)}</span>
                )}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
