import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { createGrabFoodClient } from '@/lib/grabfood/client'
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
    return NextResponse.json(
      {
        error: 'Menu notification failed',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}
