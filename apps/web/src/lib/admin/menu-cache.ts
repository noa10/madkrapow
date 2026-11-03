/**
 * The admin screens write `menu_items` / `categories` / `modifier_groups` /
 * `modifiers` straight from the browser Supabase client, so they never pass
 * through the `/api/admin/menu/*` route handlers that revalidate the public
 * caches. This is the equivalent hook for that direct-write path.
 *
 * Fire-and-forget on purpose: the write already succeeded, and a failed
 * invalidation must not surface to the admin as a save error. `keepalive` lets
 * the request outlive the navigation back to the list.
 */
export function notifyMenuChanged(): void {
  void fetch('/api/admin/menu/revalidate', { method: 'POST', keepalive: true }).catch(() => {})
}
