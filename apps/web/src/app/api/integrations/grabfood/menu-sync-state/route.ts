import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { requireGrabFoodEnabled, validatePersistedOutlet } from '@/lib/grabfood/guard'
import type { GrabMenuSyncStatePayload } from '@/lib/grabfood/types'

/**
 * Menu Sync State webhook (Grab -> POS).
 * Records the last menu sync status and errors for the mapped outlet.
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

  let payload: GrabMenuSyncStatePayload
  try {
    payload = JSON.parse(rawBody) as GrabMenuSyncStatePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!payload.merchantID && !payload.partnerMerchantID) {
    return NextResponse.json(
      { error: 'merchantID or partnerMerchantID is required' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const outlet = await validatePersistedOutlet(
    supabase,
    { merchantID: payload.merchantID, partnerMerchantID: payload.partnerMerchantID },
    { requireMerchant: false, allowUnknownMerchant: true }
  )
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const errors = (payload.errors ?? []).join('; ').slice(0, 2000)
  const row: Record<string, unknown> = {
    ...(payload.merchantID ? { grab_merchant_id: payload.merchantID } : {}),
    last_menu_sync_status: payload.status ?? 'UNKNOWN',
    last_menu_sync_at: payload.updatedAt ?? new Date().toISOString(),
    last_menu_sync_error: errors || null,
    last_menu_sync_job_id: payload.jobID ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error } = payload.partnerMerchantID
    ? await supabase
        .from('grabfood_integrations')
        .upsert(
          { ...row, partner_merchant_id: payload.partnerMerchantID },
          { onConflict: 'partner_merchant_id' }
        )
    : await supabase
        .from('grabfood_integrations')
        .update(row)
        .eq('grab_merchant_id', payload.merchantID as string)

  if (error) {
    console.error('[GrabFood] menu-sync-state failed:', error.message)
    return NextResponse.json({ error: 'Failed to persist menu sync state' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
