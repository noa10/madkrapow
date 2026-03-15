import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getItemById, type FullMenuItem } from '@/lib/queries/menu'
import { MenuItemDetail } from '@/components/menu/MenuItemDetail'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

async function getItem(id: string): Promise<FullMenuItem | null> {
  try {
    return await getItemById(id)
  } catch (error) {
    console.error('Failed to fetch item:', error)
    return null
  }
}

function PlaceholderImage({ alt: _alt }: { alt: string }) {
  return (
    <div className="relative w-full aspect-square bg-muted flex items-center justify-center">
      <span className="text-muted-foreground">No image</span>
    </div>
  )
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { id } = await params
  const item = await getItem(id)

  if (!item) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto">
        <div className="relative w-full aspect-square">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 800px"
              priority
            />
          ) : (
            <PlaceholderImage alt={item.name} />
          )}
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">{item.category.name}</p>
              <h1 className="text-3xl font-bold">{item.name}</h1>
            </div>
            <p className="text-2xl font-semibold text-orange-600">
              {formatPrice(item.price_cents)}
            </p>
          </div>

          {item.description && (
            <p className="text-muted-foreground mb-6">{item.description}</p>
          )}

          <MenuItemDetail item={item} />
        </div>
      </div>
    </main>
  )
}
