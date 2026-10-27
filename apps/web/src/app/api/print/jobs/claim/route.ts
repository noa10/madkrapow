import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { loadPrintOrder } from '@/lib/printing/order-loader'
import { buildJobBytes, jobTypesForOrder, printedMarkerFor } from '@/lib/printing/dispatch'
import { toBase64 } from '@/lib/printing/escpos'
import type { PrintJobType } from '@/lib/printing/jobs'
import { env } from '@/lib/validators/env'

/**
 * Claim pending print jobs (print bridge poll target).
 *
 * The bridge on the restaurant LAN polls this endpoint; each returned job's
 * bytes are claimed by inserting an order_events marker (`printed_<type>`)
 * so a job prints exactly once — Hubbo's already-printed dedup pattern.
 * Reprints never go through here; they use the render endpoint explicitly.
 *
 * Auth: Bearer PRINT_BRIDGE_SECRET. Fails closed when the secret is unset in
 * production; local development may run without it.
 */
function assertBridgeAuth(req: NextRequest): NextResponse | null {
  const secret = env.PRINT_BRIDGE_SECRET
  if (!secret) {
    // Fail closed like the GrabFood webhooks: only explicit non-production
    // environments may operate without a configured secret.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'PRINT_BRIDGE_SECRET is not configured' }, { status: 503 })
    }
    return null
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Invalid bridge credentials' }, { status: 401 })
  }
  return null
}

const CLAIM_WINDOW_HOURS = 24
const ACTIVE_STATUSES = ['paid', 'preparing', 'ready', 'delivering', 'completed']
const AUTO_PRINT_SOURCES = ['counter', 'grabfood']

/** Postgres foreign-key violation: the referenced order no longer exists. */
const PG_FOREIGN_KEY_VIOLATION = '23503'
/** Postgres unique violation: another bridge claimed the job first. */
const PG_UNIQUE_VIOLATION = '23505'

export async function GET(req: NextRequest) {
  const authError = assertBridgeAuth(req)
  if (authError) return authError

  const supabase = getServiceClient()
  const since = new Date(Date.now() - CLAIM_WINDOW_HOURS * 3600_000).toISOString()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, source, status, delivery_type')
    // Dine-in tickets print as soon as the order exists — a table-QR order is
    // still 'pending' (pay at the counter) but the kitchen must cook it. Other
    // pending orders are unpaid web checkouts and must never print.
    .in('status', [...ACTIVE_STATUSES, 'pending'])
    .or(
      `source.in.(${AUTO_PRINT_SOURCES.join(',')}),delivery_type.eq.dine_in`
    )
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  if (error) {
    return NextResponse.json({ error: `Failed to load orders: ${error.message}` }, { status: 500 })
  }

  const jobs: Array<{
    job_id: string
    order_id: string
    type: PrintJobType
    bytes: string
  }> = []

  for (const row of orders ?? []) {
    // The status filter above also admits unpaid web checkouts; only dine-in
    // pending orders (table QR) are real tickets.
    if (row.status === 'pending' && row.delivery_type !== 'dine_in') continue

    // The order may have been deleted/voided since the query above. Confirm it
    // still exists before doing the (more expensive) render work; the marker
    // insert below re-checks, since a delete can land in between.
    const { data: liveOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('id', row.id)
      .maybeSingle()
    if (!liveOrder) continue

    for (const type of jobTypesForOrder({
      source: row.source as string,
      status: row.status as string,
      delivery_type: row.delivery_type as string | null,
    })) {
      const marker = printedMarkerFor(type)
      const { data: existing } = await supabase
        .from('order_events')
        .select('id')
        .eq('order_id', row.id)
        .eq('event_type', marker)
        .limit(1)
      if (existing && existing.length > 0) continue

      const order = await loadPrintOrder(supabase, row.id)
      if (!order) continue

      const bytes = buildJobBytes(order, type)
      const { error: markerError } = await supabase.from('order_events').insert({
        order_id: row.id,
        event_type: marker,
        new_value: { via: 'bridge' },
      })
      if (markerError) {
        const code = (markerError as { code?: string }).code
        // The order was deleted (or voided and purged) between the query above
        // and this claim — routine churn, not a failure worth alerting on.
        // Skip it silently instead of logging a scary FK violation every poll.
        if (code === PG_FOREIGN_KEY_VIOLATION) continue
        // Another bridge won the race; its marker already guards the job.
        if (code === PG_UNIQUE_VIOLATION) continue
        console.error('[Print] failed to claim job:', markerError.message)
        continue
      }
      jobs.push({ job_id: `${row.id}:${type}`, order_id: row.id, type, bytes: toBase64(bytes) })
    }
  }

  return NextResponse.json({ ok: true, jobs })
}
