import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import {
  buildSingleItemUpdate,
  grabAvailableStatusFor,
  type GrabMenuMappingRow,
} from '@/lib/grabfood/menu'
import { env } from '@/lib/validators/env'

/**
 * Time-based sold-out (Hubbo's snooze pattern).
 *
 * POST   /api/integrations/grabfood/menu/snooze   { menuItemId, durationMinutes }
 * DELETE /api/integrations/grabfood/menu/snooze?menuItemId=...          (restore)
 *
 * Snooze is channel-level: it sets channel_products.snooze_till and pushes the
 * resulting availability to Grab (UNAVAILABLETODAY for same-day snoozes so Grab
 * auto-restores them, UNAVAILABLE + maxStock 0 otherwise). Availability itself
 * is computed at read time — an expired snooze never needs a restore write.
 */

const snoozeSchema = z.object({
  menuItemId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(1440),
})

function checkIntegrationEnabled(): NextResponse | null {
  if (!env.GRABFOOD_ENABLED && env.GRABFOOD_ENV !== 'mock') {
    return NextResponse.json(
      { error: 'GrabFood integration is disabled (GRABFOOD_ENABLED=false)' },
      { status: 409 }
    )
  }
  return null
}

async function fetchMapping(
  supabase: ReturnType<typeof getServiceClient>,
  menuItemId: string
): Promise<GrabMenuMappingRow | null> {
  const { data: row, error } = await supabase
    .from('channel_products')
    .select(
      `
      id,
      external_item_id,
      external_name,
      price_cents,
      is_available,
      snooze_till,
      menu_items ( id, name, price_cents, is_available, snooze_till, category_id )
    `
    )
    .eq('channel', 'grabfood')
    .eq('menu_item_id', menuItemId)
    .maybeSingle()
  if (error) throw error
  if (!row) return null

  const raw = row.menu_items as
    | {
        id: string
        name: string
        price_cents: number
        is_available: boolean
        snooze_till: string | null
        category_id: string | null
      }
    | Array<{ id: string; name: string; price_cents: number; is_available: boolean; snooze_till: string | null; category_id: string | null }>
    | null
  const item = Array.isArray(raw) ? raw[0] : raw
  return {
    channel_product_id: row.id,
    menu_item_id: item?.id ?? menuItemId,
    menu_item_name: item?.name ?? '(deleted item)',
    menu_item_price_cents: item?.price_cents ?? 0,
    menu_item_is_available: item?.is_available ?? false,
    menu_item_snooze_till: item?.snooze_till ?? null,
    menu_item_category_id: item?.category_id ?? null,
    external_category_id: null,
    external_item_id: row.external_item_id,
    external_name: row.external_name,
    channel_price_cents: row.price_cents,
    channel_is_available: row.is_available,
    channel_snooze_till: row.snooze_till ?? null,
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const disabled = checkIntegrationEnabled()
  if (disabled) return disabled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = snoozeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid snooze request', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { menuItemId, durationMinutes } = parsed.data

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const mapping = await fetchMapping(supabase, menuItemId)
  if (!mapping) {
    return NextResponse.json(
      { error: 'No GrabFood channel mapping for this menu item' },
      { status: 404 }
    )
  }

  const snoozeTill = new Date(Date.now() + durationMinutes * 60_000).toISOString()
  const { error: updateError } = await supabase
    .from('channel_products')
    .update({ snooze_till: snoozeTill })
    .eq('id', mapping.channel_product_id)
  if (updateError) {
    return NextResponse.json({ error: `Failed to set snooze: ${updateError.message}` }, { status: 500 })
  }

  const record = buildSingleItemUpdate(
    { ...mapping, channel_snooze_till: snoozeTill },
    merchantId
  )
  let pushed: { id: string; availableStatus: string } | null = null
  let warning: string | null = null
  if (record) {
    try {
      const client = createGrabFoodClient()
      await client.updateMenuRecord(record)
      pushed = { id: record.id, availableStatus: record.availableStatus ?? 'AVAILABLE' }
    } catch (err) {
      // The local snooze already took effect (availability is computed at read
      // time); surface the Grab push failure without failing the request.
      warning = err instanceof Error ? err.message : String(err)
      console.error('[GrabFood] snooze push failed:', err)
    }
  } else {
    warning = 'Item is not mapped to GrabFood; snooze applied locally only'
  }

  return NextResponse.json({
    ok: true,
    menu_item_id: menuItemId,
    snooze_till: snoozeTill,
    available_status: grabAvailableStatusFor({ ...mapping, channel_snooze_till: snoozeTill }),
    pushed,
    ...(warning ? { warning } : {}),
    environment: env.GRABFOOD_ENV,
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const disabled = checkIntegrationEnabled()
  if (disabled) return disabled

  const menuItemId = new URL(req.url).searchParams.get('menuItemId')
  if (!menuItemId || !z.string().uuid().safeParse(menuItemId).success) {
    return NextResponse.json({ error: 'menuItemId query parameter must be a UUID' }, { status: 400 })
  }

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const mapping = await fetchMapping(supabase, menuItemId)
  if (!mapping) {
    return NextResponse.json(
      { error: 'No GrabFood channel mapping for this menu item' },
      { status: 404 }
    )
  }

  const { error: updateError } = await supabase
    .from('channel_products')
    .update({ snooze_till: null })
    .eq('id', mapping.channel_product_id)
  if (updateError) {
    return NextResponse.json({ error: `Failed to clear snooze: ${updateError.message}` }, { status: 500 })
  }

  const record = buildSingleItemUpdate({ ...mapping, channel_snooze_till: null }, merchantId)
  let pushed: { id: string; availableStatus: string } | null = null
  let warning: string | null = null
  if (record) {
    try {
      const client = createGrabFoodClient()
      await client.updateMenuRecord(record)
      pushed = { id: record.id, availableStatus: record.availableStatus ?? 'AVAILABLE' }
    } catch (err) {
      warning = err instanceof Error ? err.message : String(err)
      console.error('[GrabFood] snooze-restore push failed:', err)
    }
  }

  return NextResponse.json({
    ok: true,
    menu_item_id: menuItemId,
    snooze_till: null,
    available_status: grabAvailableStatusFor({ ...mapping, channel_snooze_till: null }),
    pushed,
    ...(warning ? { warning } : {}),
    environment: env.GRABFOOD_ENV,
  })
}
