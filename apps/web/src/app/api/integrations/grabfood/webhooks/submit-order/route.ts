import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { getSignatureHeaderName, verifyWebhookSignature } from '@/lib/grabfood/verify'
import { handleSubmitOrder } from '../handlers'
import type { GrabSubmitOrderPayload } from '@/lib/grabfood/types'

/**
 * GrabFood Submit Order webhook.
 *
 * Grab posts a newly-paid order here; we ACK 2xx fast (< 10s requirement).
 * Processing failures that retries can fix (transient errors, unmapped
 * products) return 5xx so Grab retries; permanent duplicates/idempotent
 * replays return 200.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifyWebhookSignature(rawBody, req.headers.get(getSignatureHeaderName()))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
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

  const supabase = getServiceClient()
  const result = await handleSubmitOrder(supabase, payload)

  if (result.status === 'error' || result.status === 'unmapped') {
    // 5xx => Grab retries the delivery (mapping fixes land on retry).
    // Keep the detail server-side: it can contain PostgREST errors/item ids.
    console.error('[GrabFood] submit-order failed:', result.detail)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: result.status, order_number: result.order_number })
}
