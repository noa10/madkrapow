import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { buildMenuRecordUpdates, fetchGrabMenuMappings } from '@/lib/grabfood/menu'
import { pushMenuRecords, MenuPushError } from '@/lib/grabfood/push'
import { env } from '@/lib/validators/env'

/**
 * Push the mapped menu to GrabFood (admin/manager action).
 *
 * Builds ITEM record updates (price + availability, snooze-aware) from
 * channel_products joined to menu_items, pushes them through the throttled
 * runner (batches of <= 200 entities spaced at 1 req/s with backoff on
 * 429/5xx), then notifies Grab that the menu changed. Mock mode returns the
 * summary without network.
 */
export async function POST(_req: NextRequest) {
  const auth = await requireRole(_req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  // Never push the live menu while the integration flag is off. Mock mode is
  // offline, so it stays available for local/staging dry runs.
  if (!env.GRABFOOD_ENABLED && env.GRABFOOD_ENV !== 'mock') {
    return NextResponse.json(
      { error: 'GrabFood integration is disabled (GRABFOOD_ENABLED=false)' },
      { status: 409 }
    )
  }

  const supabase = getServiceClient()
  const { mappings, error } = await fetchGrabMenuMappings(supabase)
  if (error) {
    return NextResponse.json({ error: `Failed to load mappings: ${error}` }, { status: 500 })
  }

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json(
      { error: 'GRABFOOD_MERCHANT_ID is not configured' },
      { status: 400 }
    )
  }

  const records = buildMenuRecordUpdates(mappings, merchantId)
  const unmapped = mappings.filter((m) => !m.external_item_id)

  const client = createGrabFoodClient()
  try {
    await pushMenuRecords(client, records)
    if (records.length > 0) {
      await client.notifyMenuUpdated(merchantId)
    }
  } catch (err) {
    console.error('[GrabFood] menu sync failed:', err)
    const progress = err instanceof MenuPushError ? err.progress : null
    return NextResponse.json(
      {
        error: 'Menu sync failed',
        detail: err instanceof Error ? err.message : String(err),
        // Resumable cursor: how far the push got before failing.
        ...(progress ? { pushed_records: progress.pushedEntities, batches_total: progress.batchesTotal } : {}),
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    pushed_records: records.length,
    unmapped_products: unmapped.map((m) => ({
      menu_item_id: m.menu_item_id,
      menu_item_name: m.menu_item_name,
    })),
    environment: client.isMock ? 'mock' : env.GRABFOOD_ENV,
  })
}
