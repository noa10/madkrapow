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

  const itemHref = buildItemHref(item.slug, item.name)
  const detailActionLabel = item.has_modifiers
    ? `View details and customize ${item.name}`
    : `View details for ${item.name}`

  const showDiscount = promoPreview && promoPreview.savingsCents > 0
  const isUnavailable = !item.is_available

  const cardContent = (
    <>
      <div className={cn(
        "relative h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 overflow-hidden rounded-lg",
        isUnavailable && "grayscale"
      )}>
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className={cn(
              "object-cover transition-transform duration-300",
              !isUnavailable && "group-hover:scale-105"
            )}
            sizes="96px"
            draggable={false}
          />
        ) : (
          <PlaceholderImage />
        )}
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-xs font-semibold uppercase tracking-wider">Unavailable</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className={cn(
          "font-heading font-semibold text-base sm:text-lg line-clamp-1",
          !isUnavailable && "group-hover:text-primary transition-colors"
        )}>
          {item.name}
        </h3>
        {descriptionSnippet && (
          <p className={cn(
            "text-sm mt-0.5 line-clamp-2",
            isUnavailable ? "text-muted-foreground/60" : "text-muted-foreground"
          )}>
            {descriptionSnippet}
          </p>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          {showDiscount && !isUnavailable ? (
            <>
              <p className="font-medium text-primary">{formatPrice(promoPreview.discountedCents)}</p>
              <p className="text-sm text-muted-foreground line-through">{formatPrice(promoPreview.originalCents)}</p>
            </>
          ) : (
            <p className={cn(
              "font-medium",
              isUnavailable ? "text-muted-foreground/50" : "text-primary"
            )}>{formatPrice(item.price_cents)}</p>
          )}
        </div>
      </div>

      <div className="hidden sm:flex flex-col items-end justify-center">
        {isUnavailable ? (
          <span className="inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-destructive">
            Unavailable
          </span>
        ) : (
          <span className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors",
            item.has_modifiers
              ? "border-primary/40 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
              : "border-muted-foreground/30 text-muted-foreground group-hover:bg-muted"
          )}>
            {item.has_modifiers ? 'Customize' : 'View'}
          </span>
        )}
      </div>
    </>
  )

  return (
    <Card className={cn(
      "overflow-hidden group transition-all duration-300 border-transparent",
      isUnavailable
        ? "opacity-60 bg-muted/30 cursor-not-allowed"
        : "hover:shadow-gold hover:-translate-y-0.5 hover:border-primary/30"
    )}>
      {isUnavailable ? (
        <div
          aria-label={`${item.name} is currently unavailable`}
          className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4"
        >
          {cardContent}
        </div>
      ) : (
        <Link
          href={itemHref}
          aria-label={detailActionLabel}
          data-testid="menu-item-primary-link"
          className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {cardContent}
        </Link>
      )}
    </Card>
  )
})
