'use client'

import { memo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import type { MenuItemWithModifiers } from '@/lib/queries/menu'
import { buildItemHref } from '@/lib/item-url'

interface MenuItemCardProps {
  item: MenuItemWithModifiers
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

function PlaceholderImage({ alt: _alt }: { alt: string }) {
  return (
    <div className="relative w-full aspect-square bg-muted flex items-center justify-center">
      <span className="text-muted-foreground text-sm">No image</span>
    </div>
  )
}

export const MenuItemCard = memo(function MenuItemCard({ item }: MenuItemCardProps) {
  const descriptionSnippet = item.description
    ? item.description.length > 80
      ? item.description.slice(0, 80) + '...'
      : item.description
    : null

  const itemHref = buildItemHref(item.name, item.id)
  const detailActionLabel = item.has_modifiers
    ? `View details and customize ${item.name}`
    : `View details for ${item.name}`

  return (
    <Card
      className="overflow-hidden flex flex-col h-full group transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 border-transparent hover:border-primary/30"
    >
      <Link
        href={itemHref}
        aria-label={detailActionLabel}
        data-testid="menu-item-primary-link"
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-t-lg"
      >
        <div className="relative w-full aspect-square overflow-hidden">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105 pointer-events-none"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              draggable={false}
            />
          ) : (
            <PlaceholderImage alt={item.name} />
          )}
        </div>

        <CardContent className="flex-1 p-4">
          <h3 className="font-heading font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
            {item.name}
          </h3>
          {descriptionSnippet && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {descriptionSnippet}
            </p>
          )}
          <p className="font-medium mt-2 text-primary">{formatPrice(item.price_cents)}</p>
        </CardContent>
      </Link>

      <CardFooter className="p-4 pt-0">
        <Button asChild variant="outline" className="w-full border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground" size="sm">
          <Link href={itemHref} aria-label={detailActionLabel} data-testid="menu-item-view-link">
            {item.has_modifiers ? 'Customize' : 'View'}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
})
