/**
 * GrabFood OAuth 2.0 (client_credentials) with in-process token cache.
 *
 * Grab documents a JSON token request:
 *   POST https://api.grab.com/grabid/v1/oauth2/token
 *   Content-Type: application/json
 *   { client_id, client_secret, grant_type: "client_credentials",
 *     scope: "food.partner_api" }
 *
 * Reuse the token until it expires (sample response ~7 days) and request a new
 * one on expiry or a 401. Concurrent callers share one in-flight request so a
 * cold cache cannot stampede Grab's token endpoint.
 */

import { env } from '@/lib/validators/env'

export const GRAB_TOKEN_URL = 'https://api.grab.com/grabid/v1/oauth2/token'
export const GRABFOOD_SCOPE = 'food.partner_api'

interface CachedToken {
  token: string
  /** Epoch ms after which the token is considered expired. */
  expiresAt: number
}

// Refresh 5 minutes ahead of the documented expiry.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000

let cached: CachedToken | null = null
let inflight: Promise<string> | null = null

export function clearGrabFoodTokenCache(): void {
  cached = null
  inflight = null
}

export function isGrabFoodConfigured(): boolean {
  return Boolean(env.GRABFOOD_CLIENT_ID && env.GRABFOOD_CLIENT_SECRET)
}

export async function getAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token
  }
  if (inflight) return inflight
  if (!env.GRABFOOD_CLIENT_ID || !env.GRABFOOD_CLIENT_SECRET) {
    throw new Error('GrabFood OAuth is not configured (GRABFOOD_CLIENT_ID / GRABFOOD_CLIENT_SECRET)')
  }

  inflight = requestToken(fetchImpl).finally(() => {
    inflight = null
  })
  return inflight
}

async function requestToken(fetchImpl: typeof fetch): Promise<string> {
  const body = JSON.stringify({
    client_id: env.GRABFOOD_CLIENT_ID,
    client_secret: env.GRABFOOD_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: GRABFOOD_SCOPE,
  })

  const timeoutMs = env.GRABFOOD_REQUEST_TIMEOUT_MS ?? 8000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetchImpl(GRAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

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
    expiresAt: Date.now() + Math.max(expiresInMs - EXPIRY_MARGIN_MS, 30_000),
  }
  return cached.token
}
