import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Authenticate and authorize a user with one of the allowed roles.
 * Supports both cookie-based (web) and Bearer token (mobile) auth.
 *
 * Returns { user, supabase } on success, or a NextResponse error on failure.
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: string[]
): Promise<
  | { user: User; supabase: SupabaseClient }
  | { error: NextResponse }
> {
  const { user, supabase } = await getAuthenticatedUser(req)

  if (!user || !supabase) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const userRole = user.app_metadata?.role as string | undefined
  if (!userRole || !allowedRoles.includes(userRole)) {
    return {
      error: NextResponse.json(
        { error: `Forbidden — one of [${allowedRoles.join(', ')}] roles required` },
        { status: 403 }
      ),
    }
  }

  return { user, supabase }
}
