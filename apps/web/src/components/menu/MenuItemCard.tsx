'use client'

import { memo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import type { MenuItemWithModifiers } from '@/lib/queries/menu'
import { buildItemHref } from '@/lib/item-url'
import { cn } from '@/lib/utils'

export interface PromoPreview {
  promoCode: string
  discountedCents: number
  originalCents: number
  savingsCents: number
  discountType: 'percentage' | 'fixed'
  scope: 'item' | 'order'
}

interface MenuItemCardProps {
  item: MenuItemWithModifiers
  promoPreview?: PromoPreview | null
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

function PlaceholderImage() {
  return (
    <div className="h-full w-full bg-muted flex items-center justify-center">
      <span className="text-muted-foreground text-xs">No image</span>
    </div>
  )
}

export const MenuItemCard = memo(function MenuItemCard({ item, promoPreview }: MenuItemCardProps) {
  const descriptionSnippet = item.description
    ? item.description.length > 80
      ? item.description.slice(0, 80) + '...'
      : item.description
    : null

  const itemHref = buildItemHref(item.name, item.id)
  const detailActionLabel = item.has_modifiers
    ? `View details and customize ${item.name}`
    : `View details for ${item.name}`

  const showDiscount = promoPreview && promoPreview.savingsCents > 0

  return (
    <Card className="overflow-hidden group transition-all duration-300 hover:shadow-gold hover:-translate-y-0.5 border-transparent hover:border-primary/30">
      <Link
        href={itemHref}
        aria-label={detailActionLabel}
        data-testid="menu-item-primary-link"
        className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="relative h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 overflow-hidden rounded-lg">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="96px"
              draggable={false}
            />
          ) : (
            <PlaceholderImage />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-base sm:text-lg line-clamp-1 group-hover:text-primary transition-colors">
            {item.name}
          </h3>
          {descriptionSnippet && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {descriptionSnippet}
            </p>
          )}
          <div className="mt-1.5 flex items-baseline gap-2">
            {showDiscount ? (
              <>
                <p className="font-medium text-primary">{formatPrice(promoPreview.discountedCents)}</p>
                <p className="text-sm text-muted-foreground line-through">{formatPrice(promoPreview.originalCents)}</p>
              </>
            ) : (
              <p className="font-medium text-primary">{formatPrice(item.price_cents)}</p>
            )}
          </div>
        </div>

        <div className="hidden sm:flex flex-col items-end justify-center">
          <span className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors",
            item.has_modifiers
              ? "border-primary/40 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
              : "border-muted-foreground/30 text-muted-foreground group-hover:bg-muted"
          )}>
            {item.has_modifiers ? 'Customize' : 'View'}
          </span>
        </div>
      </Link>
    </Card>
  )
})
