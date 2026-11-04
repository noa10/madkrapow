import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'

const schema = z.object({
  modifier_id: z.guid(),
  price_cents: z.number().int().min(0).max(9999999).nullable(),
  expected_price_cents: z.number().int().min(0).nullable().optional(),
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
  const { modifier_id, price_cents } = parsed.data
  const supabase = getServiceClient()

  const { data: modifier, error: modifierError } = await supabase
    .from('modifiers').select('id').eq('id', modifier_id).maybeSingle()
  if (modifierError) return NextResponse.json({ error: `Could not load option: ${modifierError.message}` }, { status: 500 })
  if (!modifier) return NextResponse.json({ error: 'Option not found' }, { status: 404 })

  const { data: existing, error: readError } = await supabase.from('channel_modifiers')
    .select('id, price_cents').eq('channel', 'grabfood').eq('modifier_id', modifier_id).maybeSingle()
  if (readError) return NextResponse.json({ error: `Could not load GrabFood price: ${readError.message}` }, { status: 500 })

  const expected = parsed.data.expected_price_cents
  if (expected !== undefined && (existing?.price_cents ?? null) !== price_cents && ((parsed.data.expected_exists && !existing) || (existing?.price_cents ?? null) !== expected)) {
    return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload the page and review it before saving.' }, { status: 409 })
  }
  if (existing?.price_cents === price_cents || (!existing && price_cents === null)) {
    return NextResponse.json({ ok: true })
  }

  const updateExisting = () => {
    let query = supabase.from('channel_modifiers').update({ price_cents }).eq('channel', 'grabfood').eq('modifier_id', modifier_id)
    if (expected !== undefined) query = expected === null ? query.is('price_cents', null) : query.eq('price_cents', expected)
    return query.select('id').maybeSingle()
  }
  let result = existing
    ? await updateExisting()
    : await supabase.from('channel_modifiers').insert({ channel: 'grabfood', modifier_id, price_cents }).select('id').maybeSingle()
  // A concurrent save can insert the row between the read and this write.
  if (result.error?.code === '23505' && !existing) result = await updateExisting()
  if (result.error) return NextResponse.json({ error: `Could not save GrabFood price: ${result.error.message}` }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'GrabFood price changed while you were editing. Reload and try again.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
