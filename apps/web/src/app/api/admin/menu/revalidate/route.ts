import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin/require-role';
import { revalidateMenuContent } from '@/lib/menu/revalidate';

/**
 * Invalidate the public menu caches after an admin write that did not go
 * through a route handler. The admin menu screen and item form write the menu
 * tables directly with the browser Supabase client, so without this the
 * storefront, `/order` and the prerendered `/item/*` pages keep serving the
 * old menu until the revalidate window expires.
 *
 * Roles mirror who can reach `/admin` in middleware; the endpoint exposes no
 * data, it only drops caches.
 */
export async function POST(req: NextRequest) {
  const result = await requireRole(req, ['admin', 'manager']);
  if ('error' in result) return result.error;

  revalidateMenuContent();

  return NextResponse.json({ success: true });
}
