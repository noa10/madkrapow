import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { createGrabFoodClient, GrabFoodApiError } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { env } from '@/lib/validators/env'

/**
 * Trigger a full menu pull (POS -> Grab).
 *
 * Use after catalogue changes (new items, categories, prices, modifiers).
 * For single-item stock/price changes, prefer PUT /partner/v1/menu.
 */
export async function POST(req: NextRequest) {
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
    await createGrabFoodClient().notifyMenuUpdate(merchantId)
    return NextResponse.json({ ok: true, notified: true })
  } catch (err) {
    // Grab coalesces menu syncs and rejects a second request within its
    // cooldown. That is not a failed edit: the database outbox already holds
    // the change and the worker will retry after the cooldown. Report it as
    // accepted so the admin does not see a false delete/save error.
    if (err instanceof GrabFoodApiError && err.status === 409) {
      return NextResponse.json({ ok: true, notified: false, deferred: true })
    }
    return NextResponse.json(
      {
        error: 'Menu notification failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}
