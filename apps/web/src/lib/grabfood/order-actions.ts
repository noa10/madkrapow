/**
 * Channel-aware staff actions for GrabFood orders.
 *
 * Both the kitchen "Mark Ready" button and the admin status route go through
 * this service so the Grab call and the local mirror cannot drift apart.
 *
 * Grab says Mark Ready may be called only once per order. A durable claim is
 * written before the call; ambiguous or interrupted attempts require an
 * explicit operator decision after checking the Grab merchant app.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createGrabFoodClient, GrabFoodApiError, type GrabFoodClient } from './client'
import type { GrabCancelCode } from './types'

export interface OrderActionResult {
  ok: boolean
  status: number
  error?: string
  warning?: string
  uncertain?: boolean
  detail?: string
}

interface ChannelOrderRow {
  id: string
  order_id: string
  external_order_id: string
  external_store_id: string | null
  orders: { status?: string } | Array<{ status?: string }> | null
}

function currentStatus(row: ChannelOrderRow): string {
  const order = Array.isArray(row.orders) ? row.orders[0] : row.orders
  return order?.status ?? 'pending'
}

async function recordEvent(
  supabase: SupabaseClient,
  orderId: string,
  eventType: string,
  value: Record<string, unknown>
): Promise<void> {
  await supabase.from('order_events').insert({
    order_id: orderId,
    event_type: eventType,
    new_value: value,
  })
}

export async function markGrabOrderReady(
  supabase: SupabaseClient,
  internalOrderId: string,
  options: { retryUncertain?: boolean; client?: GrabFoodClient } = {}
): Promise<OrderActionResult> {
  const { data: channelOrder } = await supabase
    .from('channel_orders')
    .select('id, order_id, external_order_id, external_store_id, orders(status)')
    .eq('order_id', internalOrderId)
    .eq('channel', 'grabfood')
    .maybeSingle()

  if (!channelOrder) {
    return { ok: false, status: 404, error: 'Not a GrabFood channel order' }
  }
  const row = channelOrder as unknown as ChannelOrderRow
  const status = currentStatus(row)

  // Local transition first (idempotent when already ready).
  if (status !== 'ready') {
    const { data: updated } = await supabase
      .from('orders')
      .update({ status: 'ready' })
      .eq('id', internalOrderId)
      .eq('status', 'preparing')
      .select('id')
    if (!updated || updated.length === 0) {
      return {
        ok: false,
        status: 409,
        error: `Cannot mark ready from status '${status}'`,
      }
    }
  }

  // The unique key and compare-and-swap below serialize all callers. A pending
  // claim survives a crash and is never retried without operator confirmation.
  const token = crypto.randomUUID()
  const claims = () => supabase.from('grabfood_ready_claims')
  const { error: insertError } = await claims().insert({
    order_id: internalOrderId, state: 'pending', claim_token: token,
  })
  if (insertError) {
    if (insertError.code !== '23505') {
      return { ok: false, status: 503, error: 'Could not claim the Grab notification. Please retry.' }
    }
    const { data: claim, error } = await claims().select('state, claim_token, updated_at')
      .eq('order_id', internalOrderId).maybeSingle()
    if (error || !claim) return { ok: false, status: 503, error: 'Could not check Grab notification state.' }
    if (claim.state === 'sent') {
      return { ok: true, status: 200, warning: 'Grab was already told this order is ready.' }
    }
    // Allow the original request time to finish before offering recovery. An
    // explicit retry after checking Grab accepts the remaining uncertainty.
    if (claim.state === 'pending' && Date.now() - Date.parse(claim.updated_at) < 120_000) {
      return { ok: false, status: 409, error: 'Grab notification is in progress. Check again shortly.' }
    }
    const uncertain = claim.state !== 'failed'
    if (uncertain && !options.retryUncertain) {
      return { ok: false, status: 409, uncertain: true,
        error: 'Grab may have received Mark Ready. Check the Grab merchant app before explicitly retrying.' }
    }
    const { data: claimed, error: claimError } = await claims().update({
      state: 'pending', claim_token: token, updated_at: new Date().toISOString(),
    }).eq('order_id', internalOrderId).eq('state', claim.state)
      .eq('claim_token', claim.claim_token).select('order_id')
    if (claimError) return { ok: false, status: 503, error: 'Could not claim the Grab notification.' }
    if (!claimed?.length) return { ok: false, status: 409, error: 'Grab notification state changed. Check again.' }
  }

  const finish = async (state: 'sent' | 'failed' | 'uncertain') => {
    try {
      const { data, error } = await claims().update({ state, updated_at: new Date().toISOString() })
        .eq('order_id', internalOrderId).eq('state', 'pending').eq('claim_token', token).select('order_id')
      return !error && Boolean(data?.length)
    } catch {
      return false
    }
  }

  try {
    const client = options.client ?? createGrabFoodClient({ timeoutMs: 5000 })
    await client.markOrderReady(row.external_order_id, 1)
    if (!await finish('sent')) {
      return { ok: false, status: 503, uncertain: true,
        error: 'Grab responded, but confirmation could not be saved. Check the Grab merchant app before retrying.' }
    }
    return { ok: true, status: 200 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const apiStatus = err instanceof GrabFoodApiError ? err.status : 0
    // A server error can occur after Grab has accepted the action.
    let ambiguous = apiStatus === 0 || apiStatus >= 500 || /abort|timeout|fetch failed/i.test(message)
    if (!await finish(ambiguous ? 'uncertain' : 'failed')) ambiguous = true
    console.error('[GrabFood] mark-ready failed:', message)
    return {
      ok: false, status: 502, uncertain: ambiguous,
      error: ambiguous
        ? 'Order is ready locally, but Grab did not confirm. Check the Grab merchant app before retrying.'
        : 'Order is ready locally, but Grab rejected the notification. Retry the Grab notification.',
    }
  }
}

export async function cancelGrabOrder(
  supabase: SupabaseClient,
  internalOrderId: string,
  cancelCode: GrabCancelCode,
  options: { reason?: string; client?: GrabFoodClient } = {}
): Promise<OrderActionResult> {
  const { data: channelOrder } = await supabase
    .from('channel_orders')
    .select('id, order_id, external_order_id, external_store_id, orders(status)')
    .eq('order_id', internalOrderId)
    .eq('channel', 'grabfood')
    .maybeSingle()

  if (!channelOrder) {
    return { ok: false, status: 404, error: 'Not a GrabFood channel order' }
  }
  const row = channelOrder as unknown as ChannelOrderRow
  const status = currentStatus(row)
  const cancellable = ['pending', 'paid', 'accepted', 'preparing', 'ready']
  if (!cancellable.includes(status)) {
    return { ok: false, status: 409, error: `Cannot cancel from status '${status}'` }
  }

  const merchantId = row.external_store_id ?? process.env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return { ok: false, status: 400, error: 'GrabFood merchant ID is not configured' }
  }

  const client = options.client ?? createGrabFoodClient({ timeoutMs: 5000 })
  try {
    // Check eligibility when Grab answers; an unsupported check must not block
    // an otherwise valid cancellation.
    try {
      const eligibility = await client.getOrderCancelable(row.external_order_id, merchantId)
      if (eligibility.cancelAble === false) {
        return {
          ok: false,
          status: 409,
          error: eligibility.nonCancellationReason ?? 'Grab says this order is not cancellable',
        }
      }
    } catch {
      // Ignore check failures; the cancel call is authoritative.
    }

    await client.cancelOrder(row.external_order_id, merchantId, cancelCode)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[GrabFood] cancel failed:', message)
    return {
      ok: false,
      status: err instanceof GrabFoodApiError && err.status === 409 ? 409 : 502,
      error: 'GrabFood rejected or failed the cancellation',
      detail: message,
    }
  }

  const { data: updated } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', internalOrderId)
    .in('status', cancellable)
    .select('id')

  if (!updated || updated.length === 0) {
    await recordEvent(supabase, internalOrderId, 'grabfood_cancel_mismatch', {
      cancelCode,
      reason: options.reason ?? null,
      detail: 'Grab cancelled but local order was not in a cancellable state',
    })
    return {
      ok: true,
      status: 200,
      warning: 'Grab cancelled; local status needs manual review',
    }
  }

  await recordEvent(supabase, internalOrderId, 'grabfood_cancelled', {
    cancelCode,
    reason: options.reason ?? null,
  })
  return { ok: true, status: 200 }
}
