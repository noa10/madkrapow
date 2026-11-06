import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

/**
 * Local JWT verification (card: "verify Supabase JWTs locally instead of a
 * getUser() round trip").
 *
 * The client is module-level on purpose: auth-js caches the project's JWKS on
 * the client instance, so one instance lets the first verified request fetch
 * the public keys once and every later request verify the ES256 signature
 * locally (the JWKS cache TTL is ten minutes). persistSession and
 * autoRefreshToken are off — this client never owns a session and never writes
 * cookies; it only verifies tokens the caller already read locally.
 */
let verifier: SupabaseClient | null = null

function verifierClient(): SupabaseClient {
  if (!verifier) {
    verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  }
  return verifier
}

function firstString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Build the User shape server code reads (id plus the app_metadata role the
 * guards check) from verified access-token claims. The signature is already
 * verified; only the claim fields downstream code uses are mapped, and the
 * cast covers the optional fields of the full User type.
 */
function userFromClaims(
  claims: Record<string, unknown> | null | undefined
): User | null {
  if (!claims) return null
  const sub = firstString(claims.sub)
  if (!sub) return null

  return {
    id: sub,
    aud: firstString(claims.aud) ?? '',
    role: firstString(claims.role) ?? 'authenticated',
    email: firstString(claims.email) ?? undefined,
    phone: firstString(claims.phone) ?? '',
    app_metadata: (claims.app_metadata ?? {}) as User['app_metadata'],
    user_metadata: (claims.user_metadata ?? {}) as User['user_metadata'],
    created_at: firstString(claims.created_at) ?? '',
  } as User
}

/**
 * Verify an access token locally and return the user it represents.
 *
 * Returns null for a missing token, an invalid/expired signature, or a JWKS
 * fetch failure — callers decide whether to fall back to the network. Warm
 * calls resolve without any HTTP request until the cached JWKS expires.
 */
export async function verifyAccessToken(
  token: string | null | undefined
): Promise<User | null> {
  if (!token) return null

  try {
    const { data, error } = await verifierClient().auth.getClaims(token)
    const claims = (data as { claims?: Record<string, unknown> } | null)?.claims
    if (error || !claims) return null
    return userFromClaims(claims)
  } catch {
    return null
  }
}
