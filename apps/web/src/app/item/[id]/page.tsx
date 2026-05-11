import { notFound, permanentRedirect } from 'next/navigation'
import { getItemById, getItemBySlug, type FullMenuItem } from '@/lib/queries/menu'
import { ItemDetailClient } from '@/components/menu/ItemDetailClient'
import { buildItemHref, parseItemRouteParam } from '@/lib/item-url'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

interface PageProps {
  params: Promise<{ id: string }>
}

async function resolveItem(raw: string): Promise<{ item: FullMenuItem; shouldRedirect: boolean } | null> {
  const parsed = parseItemRouteParam(raw)

  if (parsed.kind === 'invalid') return null

  if (parsed.kind === 'slug') {
    const item = await getItemBySlug(parsed.slug)
    if (!item) return null
    return { item, shouldRedirect: item.slug !== raw }
  }

  // Legacy routes: look up by UUID, then redirect to the canonical slug URL.
  const item = await getItemById(parsed.itemId)
  if (!item) return null
  return { item, shouldRedirect: true }
}

export default async function ItemDetailPage({ params }: PageProps) {
  const { id: raw } = await params

  let resolved
  try {
    resolved = await resolveItem(raw)
  } catch (error) {
    console.error('Failed to fetch item:', error)
    notFound()
  }

  if (!resolved) {
    notFound()
  }

  const { item, shouldRedirect } = resolved
  const canonicalHref = buildItemHref(item.slug, item.name)

  if (shouldRedirect) {
    permanentRedirect(canonicalHref)
  }

  return (
    <ClientPageShell activeHref="/menu">
      <ItemDetailClient item={item} />
    </ClientPageShell>
  )
}
