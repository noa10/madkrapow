import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { buildSingleItemUpdate, type GrabMenuMappingRow } from '@/lib/grabfood/menu'
import { env } from '@/lib/validators/env'

export const dynamic = 'force-dynamic'

interface SnoozeRow {
  id: string
  external_item_id: string | null
  external_name: string | null
  price_cents: number | null
  is_available: boolean
  snooze_till: string | null
  menu_items:
    | {
        id: string
        name: string
        price_cents: number
        is_available: boolean
        snooze_till: string | null
      }
    | Array<{
        id: string
        name: string
        price_cents: number
        is_available: boolean
        snooze_till: string | null
      }>
    | null
}

function toMapping(row: SnoozeRow): GrabMenuMappingRow | null {
  const item = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items
  if (!item) return null
  return {
    channel_product_id: row.id,
    menu_item_id: item.id,
    menu_item_name: item.name,
    menu_item_price_cents: item.price_cents,
    menu_item_is_available: item.is_available,
    menu_item_snooze_till: item.snooze_till,
    external_item_id: row.external_item_id,
    external_name: row.external_name,
    channel_price_cents: row.price_cents,
    channel_is_available: row.is_available,
    channel_snooze_till: row.snooze_till,
  }
}

/**
 * Durable timed-sold-out restoration.
 *
 * A snooze is always pushed to Grab as UNAVAILABLE (not UNAVAILABLETODAY), so
 * Grab will not restore it on its own. This cron finds channel rows whose
 * snooze has expired and still require a restore, pushes the computed
 * AVAILABLE/UNAVAILABLE record, and only then clears the flag. Failures stay
 * flagged and are retried on the next run.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ skipped: true, reason: disabled.error })
  }
  if (!env.GRABFOOD_MERCHANT_ID) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('channel_products')
    .select(
      `id, external_item_id, external_name, price_cents, is_available, snooze_till,
       menu_items ( id, name, price_cents, is_available, snooze_till )`
    )
    .eq('channel', 'grabfood')
    .eq('snooze_restore_required', true)
    .not('snooze_till', 'is', null)
    .lte('snooze_till', nowIso)
    .limit(100)

  if (error) {
    return NextResponse.json({ error: `Snooze query failed: ${error.message}` }, { status: 500 })
  }

  const client = createGrabFoodClient()
  const restored: string[] = []
  const failed: Array<{ id: string; error: string }> = []

  for (const row of (data ?? []) as unknown as SnoozeRow[]) {
    const mapping = toMapping(row)
    if (!mapping) {
      failed.push({ id: row.id, error: 'menu item missing' })
      continue
    }
    const record = buildSingleItemUpdate(
      { ...mapping, channel_snooze_till: null },
      env.GRABFOOD_MERCHANT_ID
    )
    if (!record) {
      await supabase
        .from('channel_products')
        .update({ snooze_restore_required: false })
        .eq('id', row.id)
      continue
    }

    try {
      await client.updateMenuRecord(record)
      const { error: clearError } = await supabase
        .from('channel_products')
        .update({ snooze_restore_required: false })
        .eq('id', row.id)
      if (clearError) throw clearError
      restored.push(record.id)
    } catch (err) {
      failed.push({ id: row.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    checked_at: nowIso,
    restored,
    failed,
  })
}
