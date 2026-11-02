import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { env } from '@/lib/validators/env'

/**
 * Read-only menu trace (admin/manager): what Grab last recorded for this
 * merchant's menu. The POS owns the integrated catalogue, so the trace
 * reflects full-menu pulls plus per-item snooze/restore writes. Mock mode
 * returns synthetic state.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
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
