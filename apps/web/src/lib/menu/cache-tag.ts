/**
 * Cache identifiers for the public menu, kept in a module with no server-only
 * imports so client components (the admin screens) can share them.
 */
export const MENU_CACHE_TAG = 'menu'

/**
 * Every prerendered route that renders menu content. `/order` is a separate
 * ISR route from `/` and is linked from the header, so revalidating `/` alone
 * leaves it stale.
 */
export const MENU_PUBLIC_PATHS = ['/', '/order', '/cart'] as const

/** Dynamic segment whose prerendered pages are all invalidated together. */
export const MENU_ITEM_ROUTE = '/item/[id]'
