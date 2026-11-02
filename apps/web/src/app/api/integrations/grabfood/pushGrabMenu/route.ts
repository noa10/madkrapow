import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { requireGrabFoodEnabled, validateOutlet } from '@/lib/grabfood/guard'
import type { GrabMenuPayload } from '@/lib/grabfood/types'

/**
 * Push Grab Menu webhook (Grab -> POS).
 *
 * Grab pushes the store's existing menu during self-serve activation when the
 * merchant chooses to export it. The POS stores a snapshot for review/import;
 * it does not auto-map or make the pushed menu live. Returning 2xx is what
 * tells the merchant the export succeeded.
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

  let payload: GrabMenuPayload
  try {
    payload = JSON.parse(rawBody) as GrabMenuPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(payload.categories) || !Array.isArray(payload.sellingTimes)) {
    return NextResponse.json(
      { error: 'Menu payload must include sellingTimes and categories arrays' },
      { status: 400 }
    )
  }

  const outlet = validateOutlet(
    { merchantID: payload.merchantID, partnerMerchantID: payload.partnerMerchantID },
    { requireMerchant: false, allowUnknownMerchant: true }
  )
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const supabase = getServiceClient()
  const { error } = await supabase.from('grabfood_menu_snapshots').insert({
    grab_merchant_id: payload.merchantID ?? null,
    partner_merchant_id: payload.partnerMerchantID ?? null,
    payload: payload as unknown as Record<string, unknown>,
  })
  if (error) {
    console.error('[GrabFood] pushGrabMenu store failed:', error.message)
    return NextResponse.json({ error: 'Failed to store menu snapshot' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
