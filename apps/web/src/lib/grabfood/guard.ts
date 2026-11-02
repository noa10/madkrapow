/**
 * Central GrabFood integration gates.
 *
 * Every GrabFood route goes through these helpers so there is one kill switch
 * and one outlet-identity check. Mock mode is allowed without GRABFOOD_ENABLED
 * so local fixtures and unit tests can run; staging/production require the
 * explicit flag.
 */

import { env } from '@/lib/validators/env'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface GuardFailure {
  ok: false
  status: number
  error: string
}

export type GuardResult = { ok: true } | GuardFailure

export function isMock(): boolean {
  return env.GRABFOOD_ENV === 'mock'
}

export function grabFoodRuntimeEnabled(): boolean {
  if (isMock()) return true
  return env.GRABFOOD_ENABLED === true
}

export function requireGrabFoodEnabled(): GuardFailure | null {
  if (process.env.NODE_ENV === 'production' && env.GRABFOOD_ENV === 'mock') {
    return {
      ok: false,
      status: 409,
      error: 'GRABFOOD_ENV=mock is not allowed in a production process',
    }
  }
  if (grabFoodRuntimeEnabled()) return null
  return {
    ok: false,
    status: 409,
    error: 'GrabFood integration is disabled (GRABFOOD_ENABLED=false)',
  }
}

export function expectedGrabMerchantId(): string | null {
  return env.GRABFOOD_MERCHANT_ID ?? null
}

export function expectedPartnerMerchantId(): string | null {
  return env.GRABFOOD_PARTNER_MERCHANT_ID ?? null
}

/**
 * Validate the outlet identity on a Grab payload.
 *
 * `allowUnknownMerchant` is for Get Menu during self-serve activation: Grab
 * explicitly says the merchantID may first appear in that request's query, so
 * requiring it before the mapping exists would break activation.
 */
export function validateOutlet(
  payload: { merchantID?: string | null; partnerMerchantID?: string | null },
  options: { requireMerchant?: boolean; allowUnknownMerchant?: boolean } = {}
): GuardResult {
  const requireMerchant = options.requireMerchant ?? true
  const expectedMerchant = expectedGrabMerchantId()
  const expectedPartner = expectedPartnerMerchantId()

  if (requireMerchant && !payload.merchantID) {
    return { ok: false, status: 400, error: 'Missing merchantID' }
  }

  if (
    expectedMerchant &&
    payload.merchantID &&
    payload.merchantID !== expectedMerchant
  ) {
    return {
      ok: false,
      status: 403,
      error: 'merchantID does not match the configured GrabFood outlet',
    }
  }

  if (expectedPartner && payload.partnerMerchantID && payload.partnerMerchantID !== expectedPartner) {
    return {
      ok: false,
      status: 403,
      error: 'partnerMerchantID does not match the configured POS outlet',
    }
  }

  return { ok: true }
}

/** Validate against the persisted single-outlet activation mapping as well. */
export async function validatePersistedOutlet(
  supabase: SupabaseClient,
  payload: { merchantID?: string | null; partnerMerchantID?: string | null },
  options: { requireMerchant?: boolean; allowUnknownMerchant?: boolean } = {}
): Promise<GuardResult> {
  const configured = validateOutlet(payload, options)
  if (!configured.ok) return configured
  const { data, error } = await supabase
    .from('grabfood_integrations')
    .select('partner_merchant_id, grab_merchant_id')
    .limit(2)
  if (error || (data?.length ?? 0) > 1) {
    return { ok: false, status: 503, error: 'Unable to establish GrabFood outlet identity' }
  }
  const saved = data?.[0] as { partner_merchant_id: string; grab_merchant_id: string | null } | undefined
  if (saved && ((payload.partnerMerchantID && payload.partnerMerchantID !== saved.partner_merchant_id) ||
    (payload.merchantID && saved.grab_merchant_id && payload.merchantID !== saved.grab_merchant_id))) {
    return { ok: false, status: 403, error: 'Callback does not match the established GrabFood outlet' }
  }
  return { ok: true }
}

/** Merchant ID used for outbound calls: configured value wins over payload noise. */
export function outboundMerchantId(payloadMerchantId?: string | null): string | null {
  return expectedGrabMerchantId() ?? payloadMerchantId ?? null
}
