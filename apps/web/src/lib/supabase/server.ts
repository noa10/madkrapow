import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { toNextCompatibleCookieOptions } from './cookie-options'
import { verifyAccessToken } from './jwt'

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
            // This can be ignored if you have a proxy refreshing user sessions.
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
 * The happy path verifies the access token locally (verifyAccessToken, JWKS
 * cached on a module-level client) instead of paying a getUser() network round
 * trip per request. Anything local verification rejects — including an expired
 * access token that needs a refresh — falls back to the original network
 * behaviour, and a request with neither a cookie session nor a bearer token is
 * answered without any network call at all.
 *
 * Returns { user, supabase } where supabase is the service client for
 * subsequent DB operations.
 */
export async function getAuthenticatedUser(req: Request): Promise<{
  user: User | null
  supabase: SupabaseClient | null
}> {
  const cookieClient = await getServerClient()

  // 1. Cookie session (web browser): read the token locally, verify locally.
  const { data: { session } } = await cookieClient.auth.getSession()
  const cookieUser = await verifyAccessToken(session?.access_token)
  if (cookieUser) {
    return { user: cookieUser, supabase: getServiceClient() }
  }

  // 2. Bearer token (mobile app): same local verification.
  const authHeader = req.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null
  if (bearerToken) {
    const bearerUser = await verifyAccessToken(bearerToken)
    if (bearerUser) {
      return { user: bearerUser, supabase: getServiceClient() }
    }
  }

  // 3. Nothing to authenticate: skip the getUser() round trip the old code
  //    paid for every anonymous request.
  if (!session?.access_token && !bearerToken) {
    return { user: null, supabase: null }
  }

  // 4. Network fallback (the original path) for anything the local check
  //    rejected — most importantly an expired access token, which getUser()
  //    refreshes via the refresh token.
  const { data: { user: fallbackUser } } = await cookieClient.auth.getUser()
  if (fallbackUser) {
    return { user: fallbackUser, supabase: getServiceClient() }
  }

  if (bearerToken) {
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user: bearerUser }, error } = await anonClient.auth.getUser(bearerToken)
    if (!error && bearerUser) {
      return { user: bearerUser, supabase: getServiceClient() }
    }
  }

  return { user: null, supabase: null }
}
