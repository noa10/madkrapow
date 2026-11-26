import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient, GrabFoodApiError } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { env } from '@/lib/validators/env'

export const dynamic = 'force-dynamic'

/** Notify Grab that a newer menu is available. Acceptance is not application. */
export async function POST(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  // Retention is housekeeping, so it runs even while the integration is paused.
  const { error: cleanupError } = await db.rpc('cleanup_grabfood_menu_refresh')
  if (cleanupError) console.error('grabfood menu refresh cleanup failed', cleanupError.code, cleanupError.message)

  const disabled = requireGrabFoodEnabled()
  if (disabled) return NextResponse.json({ notified: false, skipped: true, reason: 'disabled' })
  if (!env.GRABFOOD_MERCHANT_ID) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  const token = randomUUID()
  const { data, error } = await db.rpc('claim_grabfood_menu_refresh', { p_token: token })
  if (error) {
    console.error('grabfood menu refresh claim failed', error.code, error.message)
    return NextResponse.json({ error: 'Failed to claim menu refresh' }, { status: 500 })
  }
  const claim = (data as Array<{ covered_revision: number }> | null)?.[0]
  if (!claim) return NextResponse.json({ notified: false, skipped: true, reason: 'nothing pending' })

  let failure: string | null = null
  let deferred = false
  try {
    await createGrabFoodClient().notifyMenuUpdate(env.GRABFOOD_MERCHANT_ID)
  } catch (err) {
    failure = (err instanceof Error ? err.message : '') || 'Menu notification failed'
    // Grab is still finishing its previous pull. The event stays pending and
    // the queue retries after the cooldown; a red failed workflow adds noise
    // without any action to take.
    deferred = err instanceof GrabFoodApiError && err.status === 409
  }
  const { data: finished, error: finishError } = await db.rpc('finish_grabfood_menu_refresh', {
    p_token: token,
    p_revision: claim.covered_revision,
    p_error: failure,
  })
  if (finishError) {
    console.error('grabfood menu refresh finish failed', finishError.code, finishError.message)
  }
  if (finishError || !finished) {
    return NextResponse.json({ error: 'Could not record menu notification; it will be retried' }, { status: 500 })
  }
  if (failure && !deferred) {
    return NextResponse.json({ error: 'Menu notification failed; it will be retried' }, { status: 502 })
  }
  if (deferred) {
    return NextResponse.json({ notified: false, deferred: true, revision: claim.covered_revision })
  }
  return NextResponse.json({ notified: true, revision: claim.covered_revision })
}
