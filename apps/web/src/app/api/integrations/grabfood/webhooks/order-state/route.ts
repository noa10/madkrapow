import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { verifyWebhookSignature } from '@/lib/grabfood/verify'
import { handleOrderState } from '../handlers'
import type { GrabOrderStatePayload } from '@/lib/grabfood/types'

/**
 * GrabFood Push Order State webhook.
 *
 * Maps Grab states onto the internal status machine via atomic conditional
 * updates. Unknown orders (e.g. historical orders predating the integration)
 * are ACKed 200 and recorded as failed integration_events.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifyWebhookSignature(rawBody, req.headers.get('x-grab-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: GrabOrderStatePayload
  try {
    payload = JSON.parse(rawBody) as GrabOrderStatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.orderID || !payload.toState) {
    return NextResponse.json({ error: 'Missing orderID/toState' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const result = await handleOrderState(supabase, payload)

  if (result.status === 'error') {
    return NextResponse.json({ error: 'Processing failed', detail: result.detail }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: result.status, detail: result.detail })
}
