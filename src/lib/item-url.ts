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

export function buildItemHref(name: string, id: string): string {
  const slug = slugifyItemName(name) || 'item'
  return `/item/${slug}--${id}`
}

export function parseItemRouteParam(slugAndId: string): {
  itemId: string | null
  isLegacyUuidRoute: boolean
} {
  if (isUuidLike(slugAndId)) {
    return {
      itemId: slugAndId,
      isLegacyUuidRoute: true,
    }
  }

  const splitIndex = slugAndId.lastIndexOf('--')
  if (splitIndex === -1) {
    return {
      itemId: null,
      isLegacyUuidRoute: false,
    }
  }

  const idCandidate = slugAndId.slice(splitIndex + 2)
  if (!isUuidLike(idCandidate)) {
    return {
      itemId: null,
      isLegacyUuidRoute: false,
    }
  }

  return {
    itemId: idCandidate,
    isLegacyUuidRoute: false,
  }
}
