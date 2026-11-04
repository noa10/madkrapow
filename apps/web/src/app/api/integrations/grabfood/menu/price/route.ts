import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { env } from '@/lib/validators/env'

const schema = z.object({
  menu_item_id: z.guid(),
  price_cents: z.number().int().min(0).max(9999999).nullable(),
  retry_notification: z.boolean().optional(),
  update_price: z.boolean().optional(),
  regular_price_changed: z.boolean().optional(),
  expected_price_cents: z.number().int().min(0).nullable().optional(),
  expected_exists: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const id = new URL(req.url).searchParams.get('menu_item_id')
  if (!z.guid().safeParse(id).success) return NextResponse.json({ error: 'Invalid menu item' }, { status: 400 })
  const { data, error } = await getServiceClient().from('channel_products')
    .select('price_cents').eq('channel', 'grabfood').eq('menu_item_id', id).maybeSingle()
  if (error) return NextResponse.json({ error: `Could not load GrabFood price: ${error.message}` }, { status: 500 })
  return NextResponse.json({ price_cents: data?.price_cents ?? null, exists: !!data })
}

export async function PUT(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid GrabFood price' }, { status: 400 })
  const { menu_item_id, price_cents } = parsed.data
  const supabase = getServiceClient()
  const { data: existing, error: readError } = await supabase.from('channel_products')
    .select('id, price_cents, external_item_id').eq('channel', 'grabfood').eq('menu_item_id', menu_item_id).maybeSingle()
  if (readError) return NextResponse.json({ error: `Could not load GrabFood price: ${readError.message}` }, { status: 500 })
  const updatePrice = parsed.data.update_price !== false
  const expected = parsed.data.expected_price_cents
  if (updatePrice && expected !== undefined && (existing?.price_cents ?? null) !== price_cents && ((parsed.data.expected_exists && !existing) || (existing?.price_cents ?? null) !== expected)) {
    return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload the page and review it before saving.' }, { status: 409 })
  }
  const shouldNotify = parsed.data.retry_notification || (parsed.data.regular_price_changed && existing?.price_cents == null)
  if (!updatePrice || existing?.price_cents === price_cents || (!existing && price_cents === null)) {
    if (!shouldNotify || !existing?.external_item_id) return NextResponse.json({ ok: true })
  }

  const updateExisting = () => {
    let query = supabase.from('channel_products').update({ price_cents }).eq('channel', 'grabfood').eq('menu_item_id', menu_item_id)
    if (expected !== undefined) query = expected === null ? query.is('price_cents', null) : query.eq('price_cents', expected)
    return query.select('id, external_item_id').maybeSingle()
  }
  let result = !updatePrice || existing?.price_cents === price_cents
    ? { data: existing, error: null }
    : existing
    ? await updateExisting()
    : await supabase.from('channel_products').insert({ channel: 'grabfood', menu_item_id, price_cents }).select('id, external_item_id').maybeSingle()
  // A concurrent mapping can be attached without replacing its other fields.
  if (result.error?.code === '23505' && !existing) result = await updateExisting()
  if (result.error) return NextResponse.json({ error: `Could not save GrabFood price: ${result.error.message}` }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload and try again.' }, { status: 409 })
  if (!result.data.external_item_id) return NextResponse.json({ ok: true })
  const disabled = requireGrabFoodEnabled()
  if (disabled) return NextResponse.json({ ok: true, warning: `Price saved locally, but GrabFood was not notified: ${disabled.error}` })
  if (!env.GRABFOOD_MERCHANT_ID) return NextResponse.json({ ok: true, warning: 'Price saved locally, but GrabFood merchant ID is not configured. Push the menu after configuration.' })
  try {
    await createGrabFoodClient().notifyMenuUpdate(env.GRABFOOD_MERCHANT_ID)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: true, warning: `Price saved locally, but GrabFood was not notified: ${err instanceof Error ? err.message : String(err)}. Push the menu to retry.` })
  }
}
