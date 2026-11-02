import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { requireGrabFoodEnabled, validateOutlet } from '@/lib/grabfood/guard'
import { eventKeyFor } from '@/lib/grabfood/redact'
import { handleOrderState } from '../handlers'
import { sanitizeForLog } from '@/lib/logging/safe-log'
import type { GrabOrderStatePayload } from '@/lib/grabfood/types'

/**
 * GrabFood Push Order State webhook.
 *
 * Grab documents PUT with an uppercase `state`. POST is kept as an alias for
 * older simulator fixtures. Unknown orders return 503 so Grab retries while
 * the submit-order import catches up; the replay cron provides the same path.
 */
async function handle(req: NextRequest) {
  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
  }

  const rawBody = await req.text()
  const auth = authenticatePartnerRequest(
    { headers: req.headers },
    { rawBody, scope: 'food.partner_api' }
  )
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let payload: GrabOrderStatePayload
  try {
    payload = JSON.parse(rawBody) as GrabOrderStatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const state = payload.state ?? payload.toState
  if (!payload.orderID || !state) {
    return NextResponse.json({ error: 'Missing orderID/state' }, { status: 400 })
  }

  const outlet = validateOutlet(
    { merchantID: payload.merchantID, partnerMerchantID: payload.partnerMerchantID },
    { requireMerchant: false }
  )
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const supabase = getServiceClient()
  const result = await handleOrderState(
    supabase,
    { ...payload, state },
    eventKeyFor('order_state', payload, payload.orderID)
  )

  if (result.status === 'error') {
    // Detail can carry a PostgREST/upstream message; keep it on one log line.
    console.error('[GrabFood] order-state failed:', sanitizeForLog(result.detail))
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
  if (result.status === 'unknown_order' || result.status === 'busy') {
    return NextResponse.json(
      { error: 'Order not available yet; retry', status: result.status },
      { status: 503 }
    )
  }

  return NextResponse.json({ ok: true, status: result.status, detail: result.detail })
}

export async function PUT(req: NextRequest) {
  return handle(req)
}

/** @deprecated Grab documents PUT; kept for older fixtures. */
export async function POST(req: NextRequest) {
  return handle(req)
}
