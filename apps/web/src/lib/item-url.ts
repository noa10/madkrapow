const UUID_V4_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function slugifyItemName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isUuidLike(value: string): boolean {
  return UUID_V4_LIKE_REGEX.test(value)
}

/**
 * Canonical item URL: `/item/{slug}` (SEO-friendly, no UUID).
 * Pass the item's persisted slug column. Falls back to slugifying the name.
 */
export function buildItemHref(slugOrName: string, fallbackName?: string): string {
  const candidate = slugOrName && slugOrName.trim().length > 0 ? slugOrName : (fallbackName ?? '')
  const slug = slugifyItemName(candidate) || 'item'
  return `/item/${slug}`
}

export type ParsedItemRouteParam =
  | { kind: 'slug'; slug: string }
  | { kind: 'legacy-slug-uuid'; itemId: string; slug: string }
  | { kind: 'legacy-uuid'; itemId: string }
  | { kind: 'invalid' }

/**
 * Parse the `[id]` segment of `/item/[id]`. Three historical shapes are accepted:
 *   - Canonical:    `set-krapow-daging` → { kind: 'slug', slug }
 *   - Legacy pair:  `set-krapow-daging--<uuid>` → { kind: 'legacy-slug-uuid', itemId, slug }
 *   - Legacy bare:  `<uuid>` → { kind: 'legacy-uuid', itemId }
 */
export function parseItemRouteParam(raw: string): ParsedItemRouteParam {
  if (!raw || raw.length === 0) {
    return { kind: 'invalid' }
  }

  if (isUuidLike(raw)) {
    return { kind: 'legacy-uuid', itemId: raw }
  }

  const splitIndex = raw.lastIndexOf('--')
  if (splitIndex !== -1) {
    const slugPart = raw.slice(0, splitIndex)
    const idCandidate = raw.slice(splitIndex + 2)
    if (isUuidLike(idCandidate)) {
      return {
        kind: 'legacy-slug-uuid',
        itemId: idCandidate,
        slug: slugPart.length > 0 ? slugPart : 'item',
      }
    }
  }

  const slug = slugifyItemName(raw)
  if (slug.length === 0) {
    return { kind: 'invalid' }
  }
  return { kind: 'slug', slug }
}
