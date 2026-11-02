/**
 * Partner-issued OAuth for Grab -> POS callbacks.
 *
 * Grab calls POST /api/integrations/grabfood/oauth/token with the client
 * credentials we issue, then sends the returned bearer token on every partner
 * callback. Tokens are stateless HMAC-signed values so any serverless instance
 * can verify them without a shared token table.
 *
 * HMAC request signing is a separate, optional project-specific requirement:
 * it never substitutes for the bearer token. It is enforced only when
 * GRABFOOD_WEBHOOK_HMAC_REQUIRED=true and a secret is configured.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { env } from '@/lib/validators/env'
import { getSignatureHeaderName, verifyWebhookSignature } from './verify'

export interface PartnerTokenPayload {
  iss: 'madkrapow-pos'
  aud: 'grabfood'
  sub: string
  scope: string
  iat: number
  exp: number
  jti: string
}

export interface PartnerTokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
}

const MAX_TOKEN_LENGTH = 4096
const DEFAULT_TTL_SECONDS = 604800

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function secret(): string | null {
  return env.GRABFOOD_PARTNER_TOKEN_SECRET ?? env.GRABFOOD_PARTNER_CLIENT_SECRET ?? null
}

function sign(payloadPart: string, key: string): string {
  return createHmac('sha256', key).update(`v1.${payloadPart}`, 'utf8').digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so differing lengths still compare in constant time.
  const ha = createHmac('sha256', 'cmp').update(a, 'utf8').digest()
  const hb = createHmac('sha256', 'cmp').update(b, 'utf8').digest()
  return timingSafeEqual(ha, hb)
}

export function isPartnerAuthConfigured(): boolean {
  return Boolean(env.GRABFOOD_PARTNER_CLIENT_ID && env.GRABFOOD_PARTNER_CLIENT_SECRET && secret())
}

export function partnerScope(): string {
  return 'food.partner_api'
}

export function issuePartnerToken(now: number = Date.now()): PartnerTokenResponse {
  const key = secret()
  if (!key || !env.GRABFOOD_PARTNER_CLIENT_ID) {
    throw new Error(
      'Partner OAuth is not configured (GRABFOOD_PARTNER_CLIENT_ID / GRABFOOD_PARTNER_CLIENT_SECRET)'
    )
  }
  const ttl = env.GRABFOOD_PARTNER_TOKEN_TTL_SECONDS ?? DEFAULT_TTL_SECONDS
  const iat = Math.floor(now / 1000)
  const payload: PartnerTokenPayload = {
    iss: 'madkrapow-pos',
    aud: 'grabfood',
    sub: env.GRABFOOD_PARTNER_CLIENT_ID,
    scope: partnerScope(),
    iat,
    exp: iat + ttl,
    jti: randomUUID(),
  }
  const payloadPart = base64url(JSON.stringify(payload))
  return {
    access_token: `v1.${payloadPart}.${sign(payloadPart, key)}`,
    token_type: 'Bearer',
    expires_in: ttl,
  }
}

export function verifyPartnerToken(
  token: string,
  now: number = Date.now()
): { ok: true; payload: PartnerTokenPayload } | { ok: false; reason: string } {
  const key = secret()
  if (!key) return { ok: false, reason: 'partner OAuth is not configured' }
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed token' }

  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'malformed token' }

  const [, payloadPart, signature] = parts
  const expected = sign(payloadPart, key)
  if (!safeEqual(signature, expected)) return { ok: false, reason: 'invalid signature' }

  let payload: PartnerTokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as PartnerTokenPayload
  } catch {
    return { ok: false, reason: 'malformed payload' }
  }

  if (payload.iss !== 'madkrapow-pos' || payload.aud !== 'grabfood') {
    return { ok: false, reason: 'invalid token audience' }
  }
  if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= now) {
    return { ok: false, reason: 'token expired' }
  }
  if (!payload.scope?.split(/\s+/).includes(partnerScope())) {
    return { ok: false, reason: 'token missing food.partner_api scope' }
  }
  return { ok: true, payload }
}

export function verifyClientCredentials(clientId: string, clientSecret: string): boolean {
  if (!env.GRABFOOD_PARTNER_CLIENT_ID || !env.GRABFOOD_PARTNER_CLIENT_SECRET) return false
  return (
    safeEqual(clientId, env.GRABFOOD_PARTNER_CLIENT_ID) &&
    safeEqual(clientSecret, env.GRABFOOD_PARTNER_CLIENT_SECRET)
  )
}

type RequestLike = { headers: Headers }

/**
 * Authenticate a Grab -> POS callback.
 *
 * In mock mode with no partner credentials configured, requests are allowed so
 * local fixtures work. Any non-mock environment requires a valid Bearer token.
 */
export function authenticatePartnerRequest(
  req: RequestLike,
  options: { rawBody?: string; scope?: string } = {}
): { ok: true } | { ok: false; status: number; error: string } {
  if (env.GRABFOOD_ENV === 'mock' && !isPartnerAuthConfigured()) {
    return { ok: true }
  }
  if (!isPartnerAuthConfigured()) {
    return { ok: false, status: 503, error: 'Partner OAuth is not configured' }
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token' }
  }
  const token = authHeader.slice(7).trim()
  const verified = verifyPartnerToken(token)
  if (!verified.ok) {
    return { ok: false, status: 401, error: `Invalid bearer token: ${verified.reason}` }
  }

  if (options.scope && !verified.payload.scope.split(/\s+/).includes(options.scope)) {
    return { ok: false, status: 403, error: `Token missing ${options.scope} scope` }
  }

  if (env.GRABFOOD_WEBHOOK_HMAC_REQUIRED) {
    if (!options.rawBody) {
      return { ok: false, status: 401, error: 'HMAC verification requires the raw request body' }
    }
    const signature = req.headers.get(getSignatureHeaderName())
    if (!verifyWebhookSignature(options.rawBody, signature)) {
      return { ok: false, status: 401, error: 'Invalid HMAC signature' }
    }
  }

  return { ok: true }
}
