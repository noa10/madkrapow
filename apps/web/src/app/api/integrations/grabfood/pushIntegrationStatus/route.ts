import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { requireGrabFoodEnabled, validatePersistedOutlet } from '@/lib/grabfood/guard'
import type { GrabIntegrationStatusPayload } from '@/lib/grabfood/types'

const STATUSES = new Set(['INACTIVE', 'ACTIVE', 'SYNCING', 'FAILED'])

/**
 * Push Store Integration Status webhook (Grab -> POS).
 * Persists the activation state and the Grab/POS store mapping.
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

  let payload: GrabIntegrationStatusPayload
  try {
    payload = JSON.parse(rawBody) as GrabIntegrationStatusPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.partnerMerchantID || !payload.grabMerchantID) {
    return NextResponse.json(
      { error: 'partnerMerchantID and grabMerchantID are required' },
      { status: 400 }
    )
  }
  if (!STATUSES.has(payload.integrationStatus)) {
    return NextResponse.json({ error: 'Invalid integrationStatus' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const outlet = await validatePersistedOutlet(
    supabase,
    { merchantID: payload.grabMerchantID, partnerMerchantID: payload.partnerMerchantID },
    { requireMerchant: false, allowUnknownMerchant: true }
  )
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const { error } = await supabase.from('grabfood_integrations').upsert(
    {
      partner_merchant_id: payload.partnerMerchantID,
      grab_merchant_id: payload.grabMerchantID,
      integration_status: payload.integrationStatus,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'partner_merchant_id' }
  )
  if (error) {
    console.error('[GrabFood] pushIntegrationStatus failed:', error.message)
    return NextResponse.json({ error: 'Failed to persist integration status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
