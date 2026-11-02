import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { replayGrabEvent } from '@/app/api/integrations/grabfood/webhooks/handlers'
import { env } from '@/lib/validators/env'

export const dynamic = 'force-dynamic'

/**
 * Re-drive GrabFood events left `received` by a crash or `failed` after a
 * transient error. Grab retries four times; this cron is the POS-side safety
 * net for the gap between the event insert and the canonical import.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ skipped: true, reason: disabled.error })
  }

  const supabase = getServiceClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('integration_events')
    .select('id, event_type, payload, attempts')
    .eq('provider', 'grabfood')
    .in('status', ['received', 'failed'])
    .lt('next_attempt_at', nowIso)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order('received_at', { ascending: true })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: `Replay query failed: ${error.message}` }, { status: 500 })
  }

  const results: Array<{ id: string; status: string; detail?: string }> = []
  const grab = createGrabFoodClient({ timeoutMs: 3000 })
  for (const event of data ?? []) {
    try {
      const result = await replayGrabEvent(supabase, event, grab)
      results.push({ id: event.id as string, status: result.status, detail: result.detail })
    } catch (err) {
      results.push({
        id: event.id as string,
        status: 'error',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ ok: true, checked_at: nowIso, replayed: results })
}
