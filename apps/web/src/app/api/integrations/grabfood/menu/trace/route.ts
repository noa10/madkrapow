import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { env } from '@/lib/validators/env'

/**
 * Menu sync trace (admin/manager): what Grab last saw — the sync outcome on
 * Grab's side after a push + notification. Mock mode returns synthetic state.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  if (!env.GRABFOOD_ENABLED && env.GRABFOOD_ENV !== 'mock') {
    return NextResponse.json(
      { error: 'GrabFood integration is disabled (GRABFOOD_ENABLED=false)' },
      { status: 409 }
    )
  }

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  try {
    const trace = await createGrabFoodClient().getMenuSyncTrace(merchantId)
    return NextResponse.json({ ok: true, trace, environment: env.GRABFOOD_ENV })
  } catch (err) {
    return NextResponse.json(
      { error: 'Menu trace lookup failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
