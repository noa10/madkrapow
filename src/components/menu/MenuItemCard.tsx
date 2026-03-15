import { memo } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import type { MenuItem } from '@/lib/queries/menu'

interface MenuItemCardProps {
  item: MenuItem
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

  return (
    <Card className="overflow-hidden flex flex-col h-full">
      <div className="relative w-full aspect-square">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <PlaceholderImage alt={item.name} />
        )}
      </div>
      
      <CardContent className="flex-1 p-4">
        <h3 className="font-semibold text-lg line-clamp-1">{item.name}</h3>
        {descriptionSnippet && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {descriptionSnippet}
          </p>
        )}
        <p className="font-medium mt-2">{formatPrice(item.price_cents)}</p>
      </CardContent>
      
      <CardFooter className="p-4 pt-0">
        <Button className="w-full" size="sm">
          Add
        </Button>
      </CardFooter>
    </Card>
  )
})
