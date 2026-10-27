'use client'

import Image from 'next/image'
import { Plus } from 'lucide-react'
import { ModifierSummary } from '@/components/menu/ModifierSummary'
import type { PosMenuItem } from '../hooks/usePosData'

interface PosMenuCardProps {
  item: PosMenuItem
  hasModifiers: boolean
  onSelect: (item: PosMenuItem) => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * A POS dish card in the storefront's visual language: text left, photo right,
 * a floating add affordance. Unlike the customer card, the whole card is the
 * tap target because the counter flow adds straight to the sale (no options).
 */
export function PosMenuCard({ item, hasModifiers, onSelect }: PosMenuCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-label={
        hasModifiers
          ? `Choose options for ${item.name}`
          : `Add ${item.name} to the sale`
      }
      className="group relative isolate flex min-h-[112px] overflow-hidden rounded-xl border border-white/10 bg-card text-left transition hover:border-primary/50 hover:bg-white/5 active:translate-y-px"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-bold leading-snug tracking-[-0.01em] text-foreground">
          {item.name}
        </span>
        <ModifierSummary hasModifiers={hasModifiers} />
        {item.description && (
          <span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {item.description}
          </span>
        )}
        <span className="mt-auto pt-1 text-[15px] font-extrabold tabular-nums tracking-[-0.01em] text-ember-text">
          {formatPrice(item.price_cents)}
        </span>
      </div>

      <div className="relative w-24 shrink-0 overflow-hidden bg-surface-sunk sm:w-28">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(min-width: 640px) 112px, 96px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            No image
          </div>
        )}

        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-foreground text-background shadow-[0_10px_24px_-10px_rgba(0,0,0,0.8)] ring-1 ring-black/10"
        >
          <Plus className="h-4 w-4" />
        </span>
      </div>
    </button>
  )
}
