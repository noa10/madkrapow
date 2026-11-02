import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled, validateOutlet } from '@/lib/grabfood/guard'
import { eventKeyFor } from '@/lib/grabfood/redact'
import { handleSubmitOrder } from '../handlers'
import { sanitizeForLog } from '@/lib/logging/safe-log'
import type { GrabSubmitOrderPayload } from '@/lib/grabfood/types'

/**
 * GrabFood Submit Order webhook.
 *
 * Grab posts a newly-paid or edited order here. We ACK 2xx only after the
 * canonical order has been committed to the POS, within Grab's 10-second
 * target. Retryable failures (unmapped products, transient errors, an
 * in-flight duplicate) return 5xx so Grab retries.
 */
export async function POST(req: NextRequest) {
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

  let payload: GrabSubmitOrderPayload
  try {
    payload = JSON.parse(rawBody) as GrabSubmitOrderPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.orderID || !payload.merchantID) {
    return NextResponse.json({ error: 'Missing orderID/merchantID' }, { status: 400 })
  }

  const outlet = validateOutlet(payload)
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const supabase = getServiceClient()
  // Acceptance is only attempted for confirmed manual-acceptance stores; the
  // 3s timeout keeps the webhook inside Grab's 10s target. Automatic stores
  // make no outbound call on the critical path.
  const result = await handleSubmitOrder(
    supabase,
    payload,
    createGrabFoodClient({ timeoutMs: 3000 }),
    eventKeyFor('submit_order', payload, payload.orderID)
  )

  if (result.status === 'error' || result.status === 'unmapped') {
    // 5xx => Grab retries the delivery (mapping fixes land on retry).
    // Keep the detail server-side: it can contain PostgREST errors or item ids.
    console.error('[GrabFood] submit-order failed:', sanitizeForLog(result.detail))
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
  if (result.status === 'busy') {
    return NextResponse.json({ error: 'Delivery already in progress' }, { status: 503 })
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    order_number: result.order_number,
  })
}
