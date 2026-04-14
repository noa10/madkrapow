import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { toNextCompatibleCookieOptions } from './cookie-options'

export async function getServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, toNextCompatibleCookieOptions(options))
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )
}

/**
 * Service-role client for trusted server-side operations (API routes).
 * Bypasses RLS — only use in server-side API routes where the caller has
 * already been authenticated via getServerClient().auth.getUser().
 */
export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

/**
 * Extract the authenticated user from EITHER:
 *  1. Cookie-based session (web browser requests via @supabase/ssr)
 *  2. Authorization: Bearer <token> header (mobile app requests)
 *
 * Returns { user, supabase } where supabase is the service client
 * for subsequent DB operations.
 */
export async function getAuthenticatedUser(req: Request): Promise<{
  user: User | null
  supabase: SupabaseClient | null
}> {
  // 1. Try cookie-based auth (web browser)
  const cookieClient = await getServerClient()
  const { data: { user: cookieUser } } = await cookieClient.auth.getUser()

  if (cookieUser) {
    return { user: cookieUser, supabase: getServiceClient() }
  }

  // 2. Try Bearer token auth (mobile app)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.slice(7)
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user: bearerUser }, error } = await anonClient.auth.getUser(accessToken)
    if (!error && bearerUser) {
      return { user: bearerUser, supabase: getServiceClient() }
    }
  }

  return { user: null, supabase: null }
}
