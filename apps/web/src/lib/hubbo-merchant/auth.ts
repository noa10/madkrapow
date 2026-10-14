/**
 * Hubbo merchant backend auth — UNOFFICIAL (see docs/hubbo-re-findings.md).
 *
 * The Hubbo POS app authenticates with `POST /api/merchant/login` carrying
 * {androidId, deviceId}; the response body.apiKey is then sent on every
 * request as the `apiKey` header plus an `X-Request-Id` UUID. A captured
 * HUBBO_MERCHANT_API_KEY env override skips the login entirely (one-time
 * capture from a real device via the Frida runbook).
 *
 * The apiKey is a credential: it is never logged and never returned.
 */

import { env } from '@/lib/validators/env'

export interface HubboMerchantSession {
  apiKey: string
}

let cachedSession: HubboMerchantSession | null = null

export function isHubboMerchantConfigured(): boolean {
  return Boolean(
    env.HUBBO_MERCHANT_API_KEY || (env.HUBBO_MERCHANT_ANDROID_ID && env.HUBBO_MERCHANT_DEVICE_ID)
  )
}

export function clearHubboMerchantSession(): void {
  cachedSession = null
}

export async function getHubboMerchantSession(
  fetchImpl: typeof fetch = fetch
): Promise<HubboMerchantSession> {
  // Captured key path: no device login needed.
  if (env.HUBBO_MERCHANT_API_KEY) {
    return { apiKey: env.HUBBO_MERCHANT_API_KEY }
  }
  if (cachedSession) return cachedSession

  const androidId = env.HUBBO_MERCHANT_ANDROID_ID
  const deviceId = env.HUBBO_MERCHANT_DEVICE_ID
  if (!androidId || !deviceId) {
    throw new Error(
      'Hubbo merchant backend is not configured: set HUBBO_MERCHANT_API_KEY or both HUBBO_MERCHANT_ANDROID_ID and HUBBO_MERCHANT_DEVICE_ID'
    )
  }

  const res = await fetchImpl(`${hubboMerchantBaseUrl()}/api/merchant/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ androidId, deviceId }),
  })
  if (!res.ok) {
    throw new Error(`Hubbo merchant login failed (${res.status})`)
  }
  const envelope = (await res.json().catch(() => ({}))) as {
    code?: string
    body?: { apiKey?: string }
    message?: string
  }
  const apiKey = envelope.body?.apiKey
  if (!apiKey) {
    throw new Error(`Hubbo merchant login returned no apiKey${envelope.message ? `: ${envelope.message}` : ''}`)
  }
  cachedSession = { apiKey }
  return cachedSession
}

export function hubboMerchantBaseUrl(): string {
  return env.HUBBO_MERCHANT_BASE_URL || 'https://api.aliments.my/alimentsBackend'
}
