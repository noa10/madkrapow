import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { buildMenuRecordUpdates, fetchGrabMenuMappings } from '@/lib/grabfood/menu'
import { env } from '@/lib/validators/env'

const BATCH_LIMIT = 200

/**
 * Push the mapped menu to GrabFood (admin/manager action).
 *
 * Builds record updates (price + availability) from channel_products joined to
 * menu_items, pushes them in batches of <= 200 (Grab's limit), then notifies
 * Grab that the menu changed. Mock mode returns the summary without network.
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
    for (let i = 0; i < records.length; i += BATCH_LIMIT) {
      await client.batchUpdateMenuRecords(records.slice(i, i + BATCH_LIMIT))
    }
    if (records.length > 0) {
      await client.notifyMenuUpdated(merchantId)
    }
  } catch (err) {
    console.error('[GrabFood] menu sync failed:', err)
    return NextResponse.json(
      { error: 'Menu sync failed', detail: err instanceof Error ? err.message : String(err) },
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
