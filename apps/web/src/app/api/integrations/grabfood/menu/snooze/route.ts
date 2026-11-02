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
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { claimMenuUpdate, releaseMenuUpdate, hasFutureMasterSnooze } from '@/lib/grabfood/menu-lease'

/**
 * Time-based sold-out (Hubbo's snooze pattern).
 *
 * POST   /api/integrations/grabfood/menu/snooze   { menuItemId, durationMinutes }
 * DELETE /api/integrations/grabfood/menu/snooze?menuItemId=...          (restore)
 *
 * Snooze is channel-level: it sets channel_products.snooze_till and pushes
 * UNAVAILABLE + maxStock 0 to Grab. A durable restore job pushes the recomputed
 * state at expiry (see /api/cron/grabfood/menu-restore). Availability itself is
 * computed at read time.
 */

const snoozeSchema = z.object({
  menuItemId: z.string().uuid(),
  durationMinutes: z.number().int().min(5).max(1440),
})

function checkIntegrationEnabled(): NextResponse | null {
  const disabled = requireGrabFoodEnabled()
  return disabled ? NextResponse.json({ error: disabled.error }, { status: disabled.status }) : null
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
      menu_items ( id, name, price_cents, is_available, snooze_till )
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
      }
    | Array<{ id: string; name: string; price_cents: number; is_available: boolean; snooze_till: string | null }>
    | null
  const item = Array.isArray(raw) ? raw[0] : raw
  return {
    channel_product_id: row.id,
    menu_item_id: item?.id ?? menuItemId,
    menu_item_name: item?.name ?? '(deleted item)',
    menu_item_price_cents: item?.price_cents ?? 0,
    menu_item_is_available: item?.is_available ?? false,
    menu_item_snooze_till: item?.snooze_till ?? null,
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
  let mapping = await fetchMapping(supabase, menuItemId)
  if (!mapping) {
    return NextResponse.json(
      { error: 'No GrabFood channel mapping for this menu item' },
      { status: 404 }
    )
  }

  const token = await claimMenuUpdate(supabase, mapping.channel_product_id)
  if (!token) return NextResponse.json({ error: 'Menu item update in progress; retry' }, { status: 409 })
  const mappingId = mapping.channel_product_id
  try {
  mapping = await fetchMapping(supabase, menuItemId)
  if (!mapping || mapping.channel_product_id !== mappingId) return NextResponse.json({ error: 'Menu mapping changed; retry' }, { status: 409 })

  const snoozeTill = new Date(Date.now() + durationMinutes * 60_000).toISOString()
  const { error: updateError } = await supabase
    .from('channel_products')
    .update({ snooze_till: snoozeTill, snooze_restore_required: true, grab_menu_restore_after: null })
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
    restore_required: true,
    ...(warning ? { warning } : {}),
    environment: env.GRABFOOD_ENV,
  })
  } finally {
    await releaseMenuUpdate(supabase, mappingId, token)
  }
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
  let mapping = await fetchMapping(supabase, menuItemId)
  if (!mapping) {
    return NextResponse.json(
      { error: 'No GrabFood channel mapping for this menu item' },
      { status: 404 }
    )
  }

  const token = await claimMenuUpdate(supabase, mapping.channel_product_id)
  if (!token) return NextResponse.json({ error: 'Menu item update in progress; retry' }, { status: 409 })
  const mappingId = mapping.channel_product_id
  try {
  mapping = await fetchMapping(supabase, menuItemId)
  if (!mapping || mapping.channel_product_id !== mappingId) return NextResponse.json({ error: 'Menu mapping changed; retry' }, { status: 409 })

  const { error: updateError } = await supabase
    .from('channel_products')
    .update({ snooze_till: null, snooze_restore_required: true, grab_menu_restore_after: null })
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
      if (hasFutureMasterSnooze(mapping.menu_item_snooze_till)) {
        const { error } = await supabase.from('channel_products')
          .update({ grab_menu_restore_after: mapping.menu_item_snooze_till }).eq('id', mappingId).eq('grab_menu_lease_token', token)
        if (error) throw error
      } else {
        const { error } = await supabase.from('channel_products')
          .update({ snooze_restore_required: false }).eq('id', mappingId).eq('grab_menu_lease_token', token)
        if (error) throw error
      }
    } catch (err) {
      warning = err instanceof Error ? err.message : String(err)
      console.error('[GrabFood] snooze-restore push failed:', err)
    }
  } else {
    warning = 'Item is not mapped to GrabFood; restore remains pending'
  }

  return NextResponse.json({
    ok: true,
    menu_item_id: menuItemId,
    snooze_till: null,
    available_status: grabAvailableStatusFor({ ...mapping, channel_snooze_till: null }),
    pushed,
    restore_required: !pushed || hasFutureMasterSnooze(mapping.menu_item_snooze_till) || Boolean(warning),
    ...(warning ? { warning } : {}),
    environment: env.GRABFOOD_ENV,
  })
  } finally {
    await releaseMenuUpdate(supabase, mappingId, token)
  }
}
