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

export async function GET(req: NextRequest) {
  const authError = assertBridgeAuth(req)
  if (authError) return authError

  const supabase = getServiceClient()
  const since = new Date(Date.now() - CLAIM_WINDOW_HOURS * 3600_000).toISOString()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, source')
    .in('source', AUTO_PRINT_SOURCES)
    .in('status', ACTIVE_STATUSES)
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
    for (const type of jobTypesForOrder(row.source as string)) {
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
        console.error('[Print] failed to claim job:', markerError.message)
        continue
      }
      jobs.push({ job_id: `${row.id}:${type}`, order_id: row.id, type, bytes: toBase64(bytes) })
    }
  }

  return NextResponse.json({ ok: true, jobs })
}
