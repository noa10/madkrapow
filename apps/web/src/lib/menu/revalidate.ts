import { revalidatePath, revalidateTag } from 'next/cache'
import { MENU_CACHE_TAG, MENU_ITEM_ROUTE, MENU_PUBLIC_PATHS } from './cache-tag'

/**
 * Drop every cache the public menu is rendered from: the `unstable_cache`
 * data entries, the prerendered routes, and the generated item pages.
 *
 * `revalidateTag` needs `{ expire: 0 }` here — route handlers get no
 * stale-while-revalidate window, so the next request must miss rather than
 * serve the old menu.
 */
export function revalidateMenuContent(): void {
  revalidateTag(MENU_CACHE_TAG, { expire: 0 })

  for (const path of MENU_PUBLIC_PATHS) {
    revalidatePath(path)
  }

  revalidatePath(MENU_ITEM_ROUTE, 'page')
}
