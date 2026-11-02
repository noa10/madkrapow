import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { requireGrabFoodEnabled, validatePersistedOutlet } from '@/lib/grabfood/guard'
import { eventKeyFor, redactGrabPayload } from '@/lib/grabfood/redact'

/**
 * Menu Event Webhook (Grab -> POS).
 *
 * The portal exposes this as a separate callback from Menu Sync State, but the
 * public guide does not define a payload schema for it. Accept and durably log
 * the event without interpreting it, so enabling the field cannot break
 * activation. Ops can inspect integration_events for the exact shape and add
 * typed handling once Grab documents it.
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

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const merchantID = typeof payload.merchantID === 'string' ? payload.merchantID : undefined
  const partnerMerchantID =
    typeof payload.partnerMerchantID === 'string' ? payload.partnerMerchantID : undefined
  const supabase = getServiceClient()
  const outlet = await validatePersistedOutlet(
    supabase,
    { merchantID, partnerMerchantID },
    { requireMerchant: false, allowUnknownMerchant: true }
  )
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const { error } = await supabase.from('integration_events').insert({
    provider: 'grabfood',
    event_type: 'menu_event',
    external_event_id: eventKeyFor('menu_event', payload, partnerMerchantID ?? 'unknown'),
    external_order_id: null,
    payload: redactGrabPayload(payload) as Record<string, unknown>,
    status: 'processed',
    processed_at: new Date().toISOString(),
  })

  if (error && (error as { code?: string }).code !== '23505') {
    console.error('[GrabFood] menu-event store failed:', error.message)
    return NextResponse.json({ error: 'Failed to store menu event' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
