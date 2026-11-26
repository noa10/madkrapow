/**
 * Claim pending print jobs exactly once.
 *
 * Every path that prints an order without being asked — the LAN bridge polling
 * and the merchant app's realtime auto-print — shares this routine so the two
 * can never disagree about what has already printed. A job is claimed by
 * inserting an `order_events` row named `printed_<type>`; the unique index on
 * (order_id, event_type) is what actually makes the claim atomic, so two
 * clients racing each other is harmless: the loser's insert fails and it skips.
 */

import { getServiceClient } from '@/lib/supabase/server'
import { loadPrintOrder } from './order-loader'
import { buildJobBytes, jobTypesForOrder, printedMarkerFor } from './dispatch'
import { toBase64 } from './escpos'
import { loadPrintStoreSettings } from './store-settings'
import type { PrintJobType } from './jobs'

/** Postgres foreign-key violation: the referenced order no longer exists. */
const PG_FOREIGN_KEY_VIOLATION = '23503'
/** Postgres unique violation: another client claimed the job first. */
const PG_UNIQUE_VIOLATION = '23505'

const CLAIM_WINDOW_HOURS = 24
const ACTIVE_STATUSES = ['paid', 'preparing', 'ready', 'delivering', 'completed']

export interface ClaimedJob {
  job_id: string
  order_id: string
  type: PrintJobType
  /** Base64 ESC/POS bytes, ready to send to a printer. */
  bytes: string
}

/**
 * Print jobs that became due in the last 24 hours and have not printed yet.
 * Returns an empty list when auto-printing is switched off in settings.
 *
 * The window uses `updated_at`, not `created_at`, so a pay-later order settled
 * hours later still prints its receipt; the docket marker dedupes it.
 */
export async function claimPendingJobs(via: 'bridge' | 'staff'): Promise<ClaimedJob[]> {
  const supabase = getServiceClient()
  const settings = await loadPrintStoreSettings(supabase)
  if (!settings.autoPrintEnabled) return []

  const since = new Date(Date.now() - CLAIM_WINDOW_HOURS * 3600_000).toISOString()
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, source, status, delivery_type')
    .in('status', [...ACTIVE_STATUSES, 'pending'])
    .gte('updated_at', since)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Failed to load orders: ${error.message}`)

  const jobs: ClaimedJob[] = []

  for (const row of orders ?? []) {
    const types = jobTypesForOrder({
      source: row.source as string,
      status: row.status as string,
      delivery_type: row.delivery_type as string | null,
    })
    // A pending web checkout is an abandoned cart: no jobs, nothing to print.
    if (types.length === 0) continue

    // The order may have been deleted/voided since the query above. Confirm it
    // still exists before doing the (more expensive) render work; the marker
    // insert below re-checks, since a delete can land in between.
    const { data: liveOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('id', row.id)
      .maybeSingle()
    if (!liveOrder) continue

    for (const type of types) {
      const marker = printedMarkerFor(type)
      const { data: existing } = await supabase
        .from('order_events')
        .select('id')
        .eq('order_id', row.id)
        .eq('event_type', marker)
        .limit(1)
      if (existing && existing.length > 0) continue

      // The order may have been deleted/voided since the query above.
      const order = await loadPrintOrder(supabase, row.id)
      if (!order) continue

      const bytes = buildJobBytes(order, type, { store: settings })
      const { error: markerError } = await supabase.from('order_events').insert({
        order_id: row.id,
        event_type: marker,
        new_value: { via },
      })
      if (markerError) {
        const code = (markerError as { code?: string }).code
        // The order was deleted (or voided and purged) between the query above
        // and this claim — routine churn, not a failure worth alerting on.
        if (code === PG_FOREIGN_KEY_VIOLATION) continue
        // Another client won the race; its marker already guards the job.
        if (code === PG_UNIQUE_VIOLATION) continue
        console.error('[Print] failed to claim job:', markerError.message)
        continue
      }
      jobs.push({ job_id: `${row.id}:${type}`, order_id: row.id, type, bytes: toBase64(bytes) })
    }
  }

  return jobs
}
