import { notFound, permanentRedirect } from 'next/navigation'
import { getItemById, type FullMenuItem } from '@/lib/queries/menu'
import { ItemDetailClient } from '@/components/menu/ItemDetailClient'
import { buildItemHref, parseItemRouteParam } from '@/lib/item-url'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

interface PageProps {
  params: Promise<{ id: string }>
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
    <ClientPageShell activeHref="/menu">
      <ItemDetailClient item={item} />
    </ClientPageShell>
  )
}
