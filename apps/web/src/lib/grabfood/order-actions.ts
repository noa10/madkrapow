/**
 * Channel-aware staff actions for GrabFood orders.
 *
 * Both the kitchen "Mark Ready" button and the admin status route go through
 * this service so the Grab call and the local mirror cannot drift apart.
 *
 * Grab says Mark Ready may be called only once per order. A definite rejection
 * is recorded and shown to staff; an ambiguous timeout is recorded as
 * `grabfood_ready_uncertain` and is NOT retried automatically. An operator can
 * explicitly retry after checking the Grab merchant app.
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

async function hasOrderEvent(
  supabase: SupabaseClient,
  orderId: string,
  eventType: string
): Promise<boolean> {
  const { data } = await supabase
    .from('order_events')
    .select('id')
    .eq('order_id', orderId)
    .eq('event_type', eventType)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
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

  const alreadySent = await hasOrderEvent(supabase, internalOrderId, 'grabfood_ready_sent')
  if (alreadySent) {
    return {
      ok: true,
      status: 200,
      warning: 'Grab was already told this order is ready (Mark Ready is once-only)',
    }
  }

  const uncertain = await hasOrderEvent(
    supabase,
    internalOrderId,
    'grabfood_ready_uncertain'
  )
  if (uncertain && !options.retryUncertain) {
    return {
      ok: false,
      status: 409,
      error:
        'A previous Mark Ready attempt timed out and its outcome is unknown. Check the Grab merchant app, then retry explicitly.',
      uncertain: true,
    }
  }

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

  const client = options.client ?? createGrabFoodClient({ timeoutMs: 5000 })
  try {
    await client.markOrderReady(row.external_order_id, 1)
    await recordEvent(supabase, internalOrderId, 'grabfood_ready_sent', {
      external_order_id: row.external_order_id,
    })
    return { ok: true, status: 200 }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const apiStatus = err instanceof GrabFoodApiError ? err.status : 0
    const ambiguous = apiStatus === 0 || /abort|timeout|fetch failed/i.test(message)
    const eventType = ambiguous ? 'grabfood_ready_uncertain' : 'grabfood_ready_failed'
    await recordEvent(supabase, internalOrderId, eventType, {
      external_order_id: row.external_order_id,
      error: message,
    })
    console.error('[GrabFood] mark-ready failed:', message)
    return {
      ok: false,
      status: 200,
      warning: ambiguous
        ? 'Order is ready locally, but Grab did not confirm. Check the merchant app before retrying.'
        : 'Order is ready locally, but GrabFood rejected the notification.',
      detail: message,
      uncertain: ambiguous,
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
