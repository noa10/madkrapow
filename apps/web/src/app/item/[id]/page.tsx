import { notFound, permanentRedirect } from 'next/navigation'
import { getItemById, getItemBySlug, getItemSlugs, type FullMenuItem } from '@/lib/queries/menu'
import { ItemDetailClient } from '@/components/menu/ItemDetailClient'
import { buildItemHref, parseItemRouteParam } from '@/lib/item-url'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Prerenders the catalog at build time. A failed lookup (a CI build without
 * database credentials, or Supabase being down) must not break the build —
 * unknown params still render on demand.
 */
export async function generateStaticParams() {
  try {
    const slugs = await getItemSlugs()
    return slugs.map((slug) => ({ id: slug }))
  } catch (error) {
    console.error('Failed to list menu item slugs:', error)
    return []
  }
}

/**
 * Menu content changes through the admin UI, which revalidates this path on
 * save. Until then a cached render is served from the edge (~55ms from
 * Malaysia) instead of re-rendering in iad1 against Supabase Tokyo (~2-3s).
 */
export const revalidate = 60

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
    <ClientPageShell>
      <ItemDetailClient item={item} />
    </ClientPageShell>
  )
}
