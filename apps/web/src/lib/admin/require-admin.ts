import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Authenticate and authorize an admin user from a Next.js API route request.
 * Supports both cookie-based (web) and Bearer token (mobile) auth.
 *
 * Returns { user, supabase } on success, or a NextResponse error on failure.
 */
export async function requireAdmin(
  req: NextRequest
): Promise<
  | { user: User; supabase: SupabaseClient }
  | { error: NextResponse }
> {
  const { user, supabase } = await getAuthenticatedUser(req);

  if (!user || !supabase) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  if ((user.app_metadata?.role as string) !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 }) };
  }

  return { user, supabase };
}
