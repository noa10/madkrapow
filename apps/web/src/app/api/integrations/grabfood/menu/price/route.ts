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
  pickup_price_cents: z.number().int().min(0).max(9999999).nullable().optional(),
  retry_notification: z.boolean().optional(),
  update_price: z.boolean().optional(),
  update_pickup_price: z.boolean().optional(),
  regular_price_changed: z.boolean().optional(),
  expected_price_cents: z.number().int().min(0).nullable().optional(),
  expected_pickup_price_cents: z.number().int().min(0).nullable().optional(),
  expected_exists: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const id = new URL(req.url).searchParams.get('menu_item_id')
  if (!z.guid().safeParse(id).success) return NextResponse.json({ error: 'Invalid menu item' }, { status: 400 })
  const { data, error } = await getServiceClient().from('channel_products')
    .select('price_cents, pickup_price_cents').eq('channel', 'grabfood').eq('menu_item_id', id).maybeSingle()
  if (error) return NextResponse.json({ error: `Could not load GrabFood price: ${error.message}` }, { status: 500 })
  return NextResponse.json({
    price_cents: data?.price_cents ?? null,
    pickup_price_cents: data?.pickup_price_cents ?? null,
    exists: !!data,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid GrabFood price' }, { status: 400 })
  const { menu_item_id, price_cents, pickup_price_cents } = parsed.data
  const supabase = getServiceClient()
  const { data: existing, error: readError } = await supabase.from('channel_products')
    .select('id, price_cents, pickup_price_cents, external_item_id')
    .eq('channel', 'grabfood').eq('menu_item_id', menu_item_id).maybeSingle()
  if (readError) return NextResponse.json({ error: `Could not load GrabFood price: ${readError.message}` }, { status: 500 })

  const updatePrice = parsed.data.update_price !== false
  const updatePickup = pickup_price_cents !== undefined && parsed.data.update_pickup_price !== false
  const expected = parsed.data.expected_price_cents
  const expectedPickup = parsed.data.expected_pickup_price_cents
  const currentPrice = existing?.price_cents ?? null
  const currentPickup = existing?.pickup_price_cents ?? null
  const priceChanged = updatePrice && currentPrice !== price_cents
  const pickupChanged = updatePickup && currentPickup !== (pickup_price_cents ?? null)

  const stale = (current: number | null, next: number | null, expectedValue: number | null | undefined) =>
    expectedValue !== undefined &&
    current !== next &&
    ((parsed.data.expected_exists && !existing) || current !== expectedValue)

  if (
    (priceChanged && stale(currentPrice, price_cents, expected)) ||
    (pickupChanged && stale(currentPickup, pickup_price_cents ?? null, expectedPickup))
  ) {
    return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload the page and review it before saving.' }, { status: 409 })
  }

  const shouldNotify =
    priceChanged ||
    pickupChanged ||
    Boolean(parsed.data.retry_notification) ||
    Boolean(parsed.data.regular_price_changed && currentPrice == null)
  const patch: Record<string, number | null> = {}
  if (priceChanged) patch.price_cents = price_cents
  if (pickupChanged) patch.pickup_price_cents = pickup_price_cents ?? null
  const insertRow = !existing && (
    (updatePrice && price_cents !== null) ||
    (updatePickup && pickup_price_cents !== null && pickup_price_cents !== undefined)
  )
  if (!existing && !insertRow && !shouldNotify) return NextResponse.json({ ok: true })
  if (existing && Object.keys(patch).length === 0 && !shouldNotify) return NextResponse.json({ ok: true })

  const updateExisting = () => {
    let query = supabase.from('channel_products').update(patch)
      .eq('channel', 'grabfood').eq('menu_item_id', menu_item_id)
    if (priceChanged && expected !== undefined) {
      query = expected === null ? query.is('price_cents', null) : query.eq('price_cents', expected)
    }
    if (pickupChanged && expectedPickup !== undefined) {
      query = expectedPickup === null
        ? query.is('pickup_price_cents', null)
        : query.eq('pickup_price_cents', expectedPickup)
    }
    return query.select('id, external_item_id').maybeSingle()
  }
  let result = existing
    ? (Object.keys(patch).length > 0 ? await updateExisting() : { data: existing, error: null })
    : insertRow
      ? await supabase.from('channel_products').insert({
          channel: 'grabfood',
          menu_item_id,
          ...(updatePrice && price_cents !== null ? { price_cents } : {}),
          ...(updatePickup && pickup_price_cents !== null && pickup_price_cents !== undefined
            ? { pickup_price_cents }
            : {}),
        }).select('id, external_item_id').maybeSingle()
      : { data: null, error: null }
  // A concurrent mapping can be attached without replacing its other fields.
  if (result.error?.code === '23505' && !existing) result = await updateExisting()
  if (result.error) return NextResponse.json({ error: `Could not save GrabFood price: ${result.error.message}` }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload and try again.' }, { status: 409 })
  if (!result.data.external_item_id) return NextResponse.json({ ok: true })
  if (!shouldNotify) return NextResponse.json({ ok: true })
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
