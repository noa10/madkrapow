/**
 * GrabFood OAuth 2.0 (client_credentials) with in-process token cache.
 *
 * Grab's docs: reuse the token until it expires (default ~7 days) and request
 * a new one only on expiry or a 401. The cache is module-scoped and refreshed
 * 5 minutes before expiry; a 401 from the API clears it (see client.ts).
 */

import { env } from '@/lib/validators/env'

const TOKEN_URL = 'https://api.grab.com/grabid/v1/oauth2/token'
const GRABFOOD_SCOPE = 'food.partner_api'

interface CachedToken {
  token: string
  /** ISO instant after which the token is considered expired */
  expiresAt: number
}

// Refresh 5 minutes ahead of the documented expiry.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

let cached: CachedToken | null = null

export function clearGrabFoodTokenCache(): void {
  cached = null
}

export function isGrabFoodConfigured(): boolean {
  return Boolean(env.GRABFOOD_CLIENT_ID && env.GRABFOOD_CLIENT_SECRET)
}

export async function getAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token
  }
  if (!env.GRABFOOD_CLIENT_ID || !env.GRABFOOD_CLIENT_SECRET) {
    throw new Error('GrabFood OAuth is not configured (GRABFOOD_CLIENT_ID / GRABFOOD_CLIENT_SECRET)')
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: GRABFOOD_SCOPE,
    client_id: env.GRABFOOD_CLIENT_ID,
    client_secret: env.GRABFOOD_CLIENT_SECRET,
  })

  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GrabFood OAuth token request failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error('GrabFood OAuth token response missing access_token')
  }

  const expiresInMs = (data.expires_in ?? 7 * 24 * 60 * 60) * 1000
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + expiresInMs - EXPIRY_MARGIN_MS,
  }
  return cached.token
}
