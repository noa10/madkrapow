/**
 * GrabFood webhook handlers: submit-order and push-order-state.
 *
 * Ingestion flow (submit-order):
 *   integration_events row (idempotency) -> map items via channel_products ->
 *   import_channel_order RPC (atomic order+items+payment+channel identity).
 *
 * Order-state flow: plan internal transitions from the current status and apply
 * them with atomic conditional updates (same guard as the Stripe webhook), then
 * record the external status on channel_orders.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrabOrderStatePayload, GrabSubmitOrderPayload } from '@/lib/grabfood/types'
import { mapGrabSubmitOrder, planInternalTransitions } from '@/lib/grabfood/mapper'
import type { ChannelProductMapping } from '@/lib/grabfood/mapper'

export type HandlerResult = {
  status: 'created' | 'duplicate' | 'skipped' | 'unmapped' | 'unknown_order' | 'noop' | 'error'
  order_number?: string
  order_id?: string
  detail?: string
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

async function recordEvent(
  supabase: SupabaseClient,
  eventType: string,
  payload: unknown,
  externalOrderId: string
): Promise<{ id: string } | { duplicate: true }> {
  const { data, error } = await supabase
    .from('integration_events')
    .insert({
      provider: 'grabfood',
      event_type: eventType,
      external_event_id: externalOrderId,
      external_order_id: externalOrderId,
      payload: payload as Record<string, unknown>,
      status: 'received',
    })
    .select('id')
    .single()

  if (error) {
    // Unique index (provider, event_type, external_event_id) => replay.
    if ((error as { code?: string }).code === '23505') {
      return { duplicate: true }
    }
    throw error
  }
  return { id: (data as { id: string }).id }
}

async function markEvent(
  supabase: SupabaseClient,
  eventId: string,
  status: 'processed' | 'failed' | 'skipped',
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('integration_events')
    .update({
      status,
      error: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId)
}

export async function handleSubmitOrder(
  supabase: SupabaseClient,
  payload: GrabSubmitOrderPayload
): Promise<HandlerResult> {
  let eventId: string | null = null
  try {
    const event = await recordEvent(supabase, 'submit_order', payload, payload.orderID)
    if ('duplicate' in event) {
      return { status: 'duplicate', detail: 'submit_order event already recorded' }
    }
    eventId = event.id

    // Idempotency anchor at the order level.
    const { data: existing } = await supabase
      .from('channel_orders')
      .select('id, order_id, orders(order_number)')
      .eq('channel', 'grabfood')
      .eq('external_order_id', payload.orderID)
      .maybeSingle()
    if (existing) {
      await markEvent(supabase, eventId, 'skipped', 'order already imported')
      const order = existing.orders as { order_number?: string } | null
      return {
        status: 'duplicate',
        order_id: existing.order_id,
        order_number: order?.order_number,
      }
    }

    // Channel product mappings for the GrabFood channel.
    const { data: mappingRows, error: mappingError } = await supabase
      .from('channel_products')
      .select('external_item_id, menu_item_id, external_name')
      .eq('channel', 'grabfood')
      .not('external_item_id', 'is', null)
    if (mappingError) throw mappingError

    const mappings = new Map<string, ChannelProductMapping>()
    for (const row of (mappingRows ?? []) as ChannelProductMapping[]) {
      mappings.set(row.external_item_id, row)
    }

    const mapped = mapGrabSubmitOrder(payload, mappings, generateOrderNumber())
    if (!mapped.ok) {
      await markEvent(
        supabase,
        eventId,
        'failed',
        `unmapped GrabFood items: ${mapped.unmapped.join(', ')}`
      )
      return { status: 'unmapped', detail: mapped.unmapped.join(', ') }
    }

    const rpcPayload = {
      order: mapped.result.order,
      items: mapped.result.items,
      payment: { ...mapped.result.payment, raw: payload as unknown as Record<string, unknown> },
      channelOrder: {
        ...mapped.result.channelOrder,
        raw_payload: payload as unknown as Record<string, unknown>,
      },
      eventType: 'grabfood_received',
    }
    const { data: rpcResult, error: rpcError } = await supabase.rpc('import_channel_order', {
      payload: rpcPayload,
    })
    if (rpcError) throw rpcError

    const result = rpcResult as { status: string; order_id?: string; order_number?: string }
    if (result.status === 'created') {
      return {
        status: 'created',
        order_id: result.order_id,
        order_number: result.order_number,
      }
    }
    // 'skipped' | 'duplicate' | 'error'
    await markEvent(supabase, eventId, result.status === 'error' ? 'failed' : 'skipped', result.status)
    return { status: result.status as HandlerResult['status'] }
  } catch (err) {
    if (eventId) {
      await markEvent(supabase, eventId, 'failed', err instanceof Error ? err.message : String(err))
    }
    console.error('[GrabFood] submit-order handler failed:', err)
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function handleOrderState(
  supabase: SupabaseClient,
  payload: GrabOrderStatePayload
): Promise<HandlerResult> {
  let eventId: string | null = null
  try {
    const event = await recordEvent(supabase, 'order_state', payload, payload.orderID)
    if ('duplicate' in event) {
      return { status: 'duplicate', detail: 'order_state event already recorded' }
    }
    eventId = event.id

    const { data: channelOrder, error } = await supabase
      .from('channel_orders')
      .select('id, order_id, external_status, orders(status)')
      .eq('channel', 'grabfood')
      .eq('external_order_id', payload.orderID)
      .maybeSingle()
    if (error) throw error
    if (!channelOrder) {
      await markEvent(supabase, eventId, 'failed', 'unknown GrabFood order')
      return { status: 'unknown_order' }
    }

    const currentStatus = (channelOrder.orders as { status?: string } | null)?.status ?? 'pending'
    const steps = planInternalTransitions(currentStatus, payload)
    let applied: string[] = []
    let status = currentStatus
    for (const step of steps) {
      // Atomic conditional update: only transition if still in the expected state.
      const { data: updated, error: updateError } = await supabase
        .from('orders')
        .update({ status: step })
        .eq('id', channelOrder.order_id)
        .eq('status', status)
        .select('id')
      if (updateError) throw updateError
      if (!updated || updated.length === 0) break
      applied.push(step)
      status = step
    }

    await supabase
      .from('channel_orders')
      .update({ external_status: payload.toState })
      .eq('id', channelOrder.id)

    await markEvent(supabase, eventId, 'processed')
    return {
      status: applied.length > 0 ? 'created' : 'noop',
      order_id: channelOrder.order_id,
      detail: applied.length > 0 ? `applied: ${applied.join('->')}` : 'no internal transition',
    }
  } catch (err) {
    if (eventId) {
      await markEvent(supabase, eventId, 'failed', err instanceof Error ? err.message : String(err))
    }
    console.error('[GrabFood] order-state handler failed:', err)
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}
