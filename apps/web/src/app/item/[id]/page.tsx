import { notFound, permanentRedirect } from 'next/navigation'
import { getItemById, type FullMenuItem } from '@/lib/queries/menu'
import { MenuItemDetail } from '@/components/menu/MenuItemDetail'
import { ItemImagePreview } from '@/components/menu/ItemImagePreview'
import { buildItemHref, parseItemRouteParam } from '@/lib/item-url'

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

export default async function ItemDetailPage({ params }: PageProps) {
  const { id: slugAndId } = await params
  const parsed = parseItemRouteParam(slugAndId)

  if (!parsed.itemId) {
    notFound()
  }

  const item = await getItem(parsed.itemId)

  if (!item) {
    notFound()
  }

  const canonicalHref = buildItemHref(item.name, item.id)
  if (parsed.isLegacyUuidRoute || slugAndId !== canonicalHref.replace('/item/', '')) {
    permanentRedirect(canonicalHref)
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,360px)_1fr] lg:items-start">
          <aside className="lg:sticky lg:top-6">
            <ItemImagePreview imageUrl={item.image_url} itemName={item.name} />
          </aside>

          <section className="rounded-2xl border bg-card p-5 sm:p-6" data-testid="item-detail-content-panel">
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
          </section>
        </div>
      </div>
    </main>
  )
}
