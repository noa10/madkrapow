/**
 * Post-payment order finalisation shared by the Stripe and Billplz webhooks
 * (and the checkout verification fallback).
 *
 * The money has already been confirmed by the caller. This module owns the
 * state transition and the fulfilment side effects so a new payment gateway
 * cannot silently skip kitchen notifications, HubboPOS sync, or Lalamove
 * dispatch.
 */

import type { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import { fulfillDeliveryOrder } from '@/lib/services/order-fulfillment'
import { notifyKitchenOfPaidOrder } from '@/lib/bots/notifications'

type ServiceClient = ReturnType<typeof createServerClient>

/** Statuses that already imply the paid -> preparing transition happened. */
const POST_PAYMENT_STATUSES = new Set([
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
])

export type FinalizePaidOrderResult =
  | { outcome: 'advanced' }
  | { outcome: 'already_processed'; status: string }
  | { outcome: 'not_found' }
  | { outcome: 'failed'; error: string }

export interface FinalizePaidOrderOptions {
  /** Gateway-specific columns written in the same atomic update. */
  paymentPatch?: Record<string, unknown>
  /** Label used in log lines, e.g. `Stripe Webhook`. */
  logLabel: string
}

/**
 * Advance a paid order to `preparing` exactly once, then run fulfilment.
 *
 * The update is conditional on the status we read, so the webhook and the
 * success-page verifier can race without double-dispatching a Lalamove order.
 */
export async function finalizePaidOrder(
  supabase: ServiceClient,
  orderId: string,
  options: FinalizePaidOrderOptions,
): Promise<FinalizePaidOrderResult> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return { outcome: 'not_found' }
  }

  if (POST_PAYMENT_STATUSES.has(order.status)) {
    return { outcome: 'already_processed', status: order.status }
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'preparing',
      ...(options.paymentPatch ?? {}),
    })
    .eq('id', orderId)
    .eq('status', order.status)
    .select('id')

  if (updateError) {
    return { outcome: 'failed', error: updateError.message }
  }

  if (!updatedRows || updatedRows.length === 0) {
    return { outcome: 'already_processed', status: 'preparing' }
  }

  console.log(`[${options.logLabel}] Order ${orderId} marked as paid and advanced to preparing`)

  // Bot order notifications are best-effort and must never fail the webhook.
  if (order.source === 'telegram' || order.source === 'whatsapp') {
    await notifyKitchenOfPaidOrder(orderId)
    try {
      const { sendOrderStatusNotification } = await import('@/lib/bots/order-notifications')
      await sendOrderStatusNotification(orderId, 'preparing')
    } catch {
      // Notification failure must not break payment finalisation.
    }
  }

  await attemptHubboPosPush(supabase, orderId)

  const deliveryType = order.delivery_type || 'delivery'
  const fulfillmentType = order.fulfillment_type || 'asap'

  if (deliveryType === 'self_pickup') {
    await supabase
      .from('orders')
      .update({ dispatch_status: 'not_ready' })
      .eq('id', orderId)

    console.log(`[${options.logLabel}] Self-pickup dispatch not_ready:`, orderId)
  } else if (fulfillmentType === 'scheduled') {
    await supabase
      .from('orders')
      .update({ dispatch_status: 'queued' })
      .eq('id', orderId)

    console.log(`[${options.logLabel}] Scheduled delivery queued:`, orderId)
  } else {
    const result = await fulfillDeliveryOrder(supabase, orderId)
    console.log(
      `[${options.logLabel}] ASAP delivery ${result.success ? 'dispatched' : 'failed'}:`,
      orderId,
    )
  }

  return { outcome: 'advanced' }
}

async function attemptHubboPosPush(
  supabase: ServiceClient,
  orderId: string,
): Promise<void> {
  if (!env.HUBBOPOS_ENABLED) return

  try {
    const { createHubboPosClient } = await import('@/lib/hubbopos/client')
    const { buildOrderPayload } = await import('@/lib/hubbopos/orders')

    const payload = await buildOrderPayload(orderId)
    if (!payload) return

    const client = createHubboPosClient()
    const response = await client.createOrder(payload)

    await supabase
      .from('orders')
      .update({
        hubbo_pos_trans_id: payload.trans_id,
        hubbo_pos_invoice_no: payload.invoice_no,
        hubbo_pos_order_id: response.hubbo_order_id || null,
        hubbo_pos_sync_status: 'synced',
        hubbo_pos_last_synced_at: new Date().toISOString(),
        hubbo_pos_last_error: null,
      })
      .eq('id', orderId)

    console.log(`[Payment] HubboPOS order pushed: ${orderId} -> ${response.hubbo_order_id}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isRetryable = !(
      error instanceof Error &&
      (error.name === 'HubboPosValidationError' || error.name === 'HubboPosAuthError')
    )

    await supabase
      .from('orders')
      .update({
        hubbo_pos_sync_status: isRetryable ? 'pending' : 'failed',
        hubbo_pos_last_error: errorMessage,
      })
      .eq('id', orderId)

    if (isRetryable) {
      const { data: order } = await supabase
        .from('orders')
        .select('order_number')
        .eq('id', orderId)
        .single()

      await supabase.from('hubbopos_sync_queue').insert({
        order_id: orderId,
        action: 'create_order',
        payload: {
          trans_id: `mk-${orderId}`,
          invoice_no: order?.order_number
            ? `MK-${order.order_number}`
            : `MK-${orderId.slice(0, 8)}`,
        },
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      })
    }

    console.error(`[Payment] HubboPOS push failed for ${orderId}:`, errorMessage)
  }
}
