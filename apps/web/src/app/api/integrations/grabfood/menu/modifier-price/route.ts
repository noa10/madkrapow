import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'

const schema = z.object({
  modifier_id: z.guid(),
  price_cents: z.number().int().min(0).max(9999999).nullable(),
  pickup_price_cents: z.number().int().min(0).max(9999999).nullable().optional(),
  update_pickup_price: z.boolean().optional(),
  expected_price_cents: z.number().int().min(0).nullable().optional(),
  expected_pickup_price_cents: z.number().int().min(0).nullable().optional(),
  expected_exists: z.boolean().optional(),
})

/**
 * Persist the GrabFood add-on price for one modifier.
 *
 * This route only writes channel_modifiers. Callers refresh the Grab menu
 * themselves — the admin options editor already runs the shared full-menu
 * refresh after saving a modifier, so notifying here would push twice.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid GrabFood price' }, { status: 400 })
  const { modifier_id, price_cents, pickup_price_cents } = parsed.data
  const supabase = getServiceClient()

  const { data: modifier, error: modifierError } = await supabase
    .from('modifiers').select('id').eq('id', modifier_id).maybeSingle()
  if (modifierError) return NextResponse.json({ error: `Could not load option: ${modifierError.message}` }, { status: 500 })
  if (!modifier) return NextResponse.json({ error: 'Option not found' }, { status: 404 })

  const { data: existing, error: readError } = await supabase.from('channel_modifiers')
    .select('id, price_cents, pickup_price_cents')
    .eq('channel', 'grabfood').eq('modifier_id', modifier_id).maybeSingle()
  if (readError) return NextResponse.json({ error: `Could not load GrabFood price: ${readError.message}` }, { status: 500 })

  const updatePickup = pickup_price_cents !== undefined && parsed.data.update_pickup_price !== false
  const expected = parsed.data.expected_price_cents
  const expectedPickup = parsed.data.expected_pickup_price_cents
  const currentPrice = existing?.price_cents ?? null
  const currentPickup = existing?.pickup_price_cents ?? null
  const priceChanged = currentPrice !== price_cents
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

  const patch: Record<string, number | null> = {}
  if (priceChanged) patch.price_cents = price_cents
  if (pickupChanged) patch.pickup_price_cents = pickup_price_cents ?? null
  const insertRow = !existing && (price_cents !== null || (updatePickup && pickup_price_cents != null))
  if (!existing && !insertRow) return NextResponse.json({ ok: true })
  if (existing && Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const updateExisting = () => {
    let query = supabase.from('channel_modifiers').update(patch)
      .eq('channel', 'grabfood').eq('modifier_id', modifier_id)
    if (priceChanged && expected !== undefined) {
      query = expected === null ? query.is('price_cents', null) : query.eq('price_cents', expected)
    }
    if (pickupChanged && expectedPickup !== undefined) {
      query = expectedPickup === null
        ? query.is('pickup_price_cents', null)
        : query.eq('pickup_price_cents', expectedPickup)
    }
    return query.select('id').maybeSingle()
  }
  let result = existing
    ? await updateExisting()
    : await supabase.from('channel_modifiers').insert({
        channel: 'grabfood',
        modifier_id,
        ...(price_cents !== null ? { price_cents } : {}),
        ...(updatePickup && pickup_price_cents != null ? { pickup_price_cents } : {}),
      }).select('id').maybeSingle()
  // A concurrent save can insert the row between the read and this write.
  if (result.error?.code === '23505' && !existing) result = await updateExisting()
  if (result.error) return NextResponse.json({ error: `Could not save GrabFood price: ${result.error.message}` }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload and try again.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
