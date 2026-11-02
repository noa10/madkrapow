import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { env } from '@/lib/validators/env'

const ActivationSchema = z.object({
  partnerMerchantID: z.string().min(1).max(64).optional(),
})

/**
 * Create a self-serve activation journey (POS -> Grab).
 *
 * The returned URL must be opened by a Grab Merchant Owner or Store Manager;
 * it is an activation webview, not an OAuth redirect URI. The integration
 * status and Grab/POS mapping arrive later via pushIntegrationStatus.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
  }

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    // Body is optional; default to the configured POS outlet.
  }
  const parsed = ActivationSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid activation request', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const partnerMerchantId = parsed.data.partnerMerchantID ?? env.GRABFOOD_PARTNER_MERCHANT_ID
  if (!partnerMerchantId) {
    return NextResponse.json(
      { error: 'GRABFOOD_PARTNER_MERCHANT_ID is not configured' },
      { status: 400 }
    )
  }

  const client = createGrabFoodClient()
  try {
    const journey = await client.createSelfServeJourney(partnerMerchantId)
    const activationUrl = (journey as { activationUrl?: string }).activationUrl
    if (!activationUrl) {
      return NextResponse.json({
        ok: true,
        mock: true,
        message: 'Mock mode: no activation URL is generated',
      })
    }

    const supabase = getServiceClient()
    const { error } = await supabase.from('grabfood_integrations').upsert(
      {
        partner_merchant_id: partnerMerchantId,
        activation_url: activationUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'partner_merchant_id' }
    )
    if (error) {
      console.error('[GrabFood] activation URL persist failed:', error.message)
    }

    return NextResponse.json({ ok: true, activation_url: activationUrl })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to create activation journey',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}
