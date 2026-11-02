/**
 * Optional HMAC request verification for GrabFood callbacks.
 *
 * OAuth bearer validation is the primary authentication (partner-auth.ts).
 * HMAC over the RAW body is an additional project-specific requirement: Grab
 * has not confirmed a signature scheme for this project, so it is disabled by
 * default and only enforced when GRABFOOD_WEBHOOK_HMAC_REQUIRED=true.
 *
 * The header name is configurable via GRABFOOD_WEBHOOK_SIGNATURE_HEADER so a
 * confirmed scheme can be aligned without a code change.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { env } from '@/lib/validators/env'

const DEFAULT_SIGNATURE_HEADER = 'x-grab-signature'

export function getSignatureHeaderName(): string {
  return env.GRABFOOD_WEBHOOK_SIGNATURE_HEADER?.toLowerCase() ?? DEFAULT_SIGNATURE_HEADER
}

export function isWebhookVerificationEnabled(): boolean {
  return Boolean(env.GRABFOOD_WEBHOOK_SECRET)
}

export function computeSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

/**
 * Verify a webhook request's signature against the raw body.
 * @returns true when valid (or when verification is disabled), false otherwise
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = env.GRABFOOD_WEBHOOK_SECRET
  if (!secret) {
    // Fail closed. An unset secret must never let unauthenticated requests
    // through a production process, so the bypass is limited to an explicit
    // mock (or unconfigured) local environment outside production. Staging and
    // production MUST set GRABFOOD_WEBHOOK_SECRET.
    const grabEnv = process.env.GRABFOOD_ENV ?? env.GRABFOOD_ENV
    return process.env.NODE_ENV !== 'production' && (grabEnv === undefined || grabEnv === 'mock')
  }
  if (!signatureHeader) return false

  const expected = computeSignature(rawBody, secret)
  const provided = signatureHeader.trim().replace(/^sha256=/i, '')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
