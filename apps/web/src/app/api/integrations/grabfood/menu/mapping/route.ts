import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { env } from '@/lib/validators/env'

/**
 * channel_products mapping management (admin/manager).
 *
 * PATCH  — update an existing mapping: external id, channel price override
 *          (null clears the override), availability.
 * POST   — map an unmapped local item (creates the channel_products row).
 * DELETE — unmap (row id in ?channel_product_id=).
 *
 * Because the POS owns the integrated catalogue, every successful change
 * notifies Grab to pull the full menu. A notification failure is returned as a
 * warning: the local change is saved and can be retried.
 */

async function notifyMenuChange(): Promise<string | null> {
  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) return 'GRABFOOD_MERCHANT_ID is not configured'
  try {
    await createGrabFoodClient().notifyMenuUpdate(merchantId)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
const patchSchema = z.object({
  channel_product_id: z.guid(),
  external_item_id: z.string().min(1).max(200).optional(),
  price_cents: z.number().int().min(0).max(9999999).nullable().optional(),
  is_available: z.boolean().optional(),
})

const createSchema = z.object({
  menu_item_id: z.guid(),
  external_item_id: z.string().min(1).max(200),
  external_name: z.string().min(1).max(200).optional(),
  price_cents: z.number().int().min(0).max(9999999).nullable().optional(),
})

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const disabled = requireGrabFoodEnabled()
  if (disabled) return NextResponse.json({ error: disabled.error }, { status: disabled.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid mapping update', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { channel_product_id, ...updates } = parsed.data
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('channel_products')
    .update(updates)
    .eq('id', channel_product_id)
    .eq('channel', 'grabfood')
    .select('id, external_item_id')
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'GrabFood mapping not found' }, { status: 404 })
  const notificationWarning = data.external_item_id ? await notifyMenuChange() : null
  return NextResponse.json({ ok: true, ...(notificationWarning ? { warning: notificationWarning } : {}) })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const disabled = requireGrabFoodEnabled()
  if (disabled) return NextResponse.json({ error: disabled.error }, { status: disabled.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid mapping creation', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const attach = () => supabase.from('channel_products')
    .update({ external_item_id: parsed.data.external_item_id, ...(parsed.data.external_name ? { external_name: parsed.data.external_name } : {}), ...(parsed.data.price_cents !== undefined ? { price_cents: parsed.data.price_cents } : {}) })
    .eq('channel', 'grabfood').eq('menu_item_id', parsed.data.menu_item_id)
    .is('external_item_id', null).select('id').maybeSingle()
  let { data, error } = await attach()
  if (!data && !error) {
    const inserted = await supabase.from('channel_products').insert({
      channel: 'grabfood',
      menu_item_id: parsed.data.menu_item_id,
      external_item_id: parsed.data.external_item_id,
      external_name: parsed.data.external_name ?? null,
      price_cents: parsed.data.price_cents ?? null,
    }).select('id').maybeSingle()
    data = inserted.data
    error = inserted.error
    if (error?.code === '23505') {
      const retry = await attach()
      if (retry.data || retry.error) { data = retry.data; error = retry.error }
    }
  }
  if (error || !data) {
    // 23505: already mapped (unique channel+menu_item or channel+external id).
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Item or external id is already mapped' }, { status: 409 })
    }
    return NextResponse.json({ error: `Mapping failed: ${error?.message ?? 'item already mapped'}` }, { status: 500 })
  }
  const notificationWarning = await notifyMenuChange()
  return NextResponse.json(
    {
      ok: true,
      channel_product_id: (data as { id: string }).id,
      ...(notificationWarning ? { warning: notificationWarning } : {}),
    },
    { status: 201 }
  )
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const disabled = requireGrabFoodEnabled()
  if (disabled) return NextResponse.json({ error: disabled.error }, { status: disabled.status })

  const channelProductId = new URL(req.url).searchParams.get('channel_product_id')
  if (!channelProductId || !z.guid().safeParse(channelProductId).success) {
    return NextResponse.json(
      { error: 'channel_product_id query parameter must be a UUID' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase.from('channel_products')
    .update({ external_item_id: null, external_name: null })
    .eq('id', channelProductId).eq('channel', 'grabfood')
    .select('id').maybeSingle()
  if (error) {
    return NextResponse.json({ error: `Unmap failed: ${error.message}` }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'GrabFood mapping not found' }, { status: 404 })
  const notificationWarning = await notifyMenuChange()
  return NextResponse.json({ ok: true, ...(notificationWarning ? { warning: notificationWarning } : {}) })
}
