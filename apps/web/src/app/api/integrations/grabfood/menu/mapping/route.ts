import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * channel_products / channel_categories mapping management (admin/manager).
 *
 * PATCH  — update an existing mapping: external id, channel price override
 *          (null clears the override), availability. Saved silently; use the
 *          sync route to push changes to Grab.
 * POST   — map an unmapped local item (creates the channel_products row).
 * DELETE — unmap (row id in ?channel_product_id=).
 *
 * Service client: RLS admin/manager policy also covers this, but the route is
 * the audited boundary (idempotent partial updates, zod-validated).
 */
const patchSchema = z.object({
  channel_product_id: z.string().uuid(),
  external_item_id: z.string().min(1).max(200).optional(),
  price_cents: z.number().int().min(0).max(9999999).nullable().optional(),
  is_available: z.boolean().optional(),
})

const createSchema = z.object({
  menu_item_id: z.string().uuid(),
  external_item_id: z.string().min(1).max(200),
  external_name: z.string().min(1).max(200).optional(),
  price_cents: z.number().int().min(0).max(9999999).nullable().optional(),
})

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

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
  const { error } = await supabase
    .from('channel_products')
    .update(updates)
    .eq('id', channel_product_id)
  if (error) {
    return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

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
  const { data, error } = await supabase
    .from('channel_products')
    .insert({
      channel: 'grabfood',
      menu_item_id: parsed.data.menu_item_id,
      external_item_id: parsed.data.external_item_id,
      external_name: parsed.data.external_name ?? null,
      price_cents: parsed.data.price_cents ?? null,
    })
    .select('id')
    .single()
  if (error) {
    // 23505: already mapped (unique channel+menu_item or channel+external id).
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Item or external id is already mapped' }, { status: 409 })
    }
    return NextResponse.json({ error: `Mapping failed: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true, channel_product_id: (data as { id: string }).id }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const channelProductId = new URL(req.url).searchParams.get('channel_product_id')
  if (!channelProductId || !z.string().uuid().safeParse(channelProductId).success) {
    return NextResponse.json(
      { error: 'channel_product_id query parameter must be a UUID' },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const { error } = await supabase.from('channel_products').delete().eq('id', channelProductId)
  if (error) {
    return NextResponse.json({ error: `Unmap failed: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
