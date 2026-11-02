/**
 * GrabFood webhook handlers: Submit Order and Push Order State.
 *
 * Reliability model:
 *   - Deliveries are recorded in integration_events using a payload hash.
 *     Because Grab's edit revision is not established, edits are retained as
 *     failures for reconciliation rather than applied or acknowledged.
 *   - Processing leases the event row. A crash leaves it `received` with a
 *     lease, and the replay cron re-drives it after the lease expires.
 *   - Submit ACKs 2xx only after the order is committed to the POS. Outbound
 *     acceptance is attempted only in confirmed manual-acceptance mode and is
 *     recorded as an order event if it fails.
 *   - Unknown order-state pushes return a retryable result (HTTP 503), so
 *     Grab retries while the order is being imported, instead of silently
 *     acknowledging a state that was never applied.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrabOrderStatePayload, GrabSubmitOrderPayload } from '@/lib/grabfood/types'
import { mapGrabSubmitOrder, planInternalTransitions } from '@/lib/grabfood/mapper'
import type { ChannelProductMapping } from '@/lib/grabfood/mapper'
import { redactGrabPayload } from '@/lib/grabfood/redact'
import { env } from '@/lib/validators/env'

/**
 * Grab-side actions taken after a successful local import. Acceptance is
 * time-sensitive only for manual-acceptance stores.
 */
export interface GrabOrderActions {
  acceptOrder(orderId: string, toState?: 'Accepted' | 'Rejected'): Promise<void>
  updateReadyTime?(orderId: string, newOrderReadyTime: string): Promise<void>
}

/** Promised ready time reported to Grab on acceptance (configurable later). */
export const DEFAULT_READY_TIME_MINUTES = 20
export const MAX_EVENT_ATTEMPTS = 6
const LEASE_MS = 60_000

export type HandlerResult = {
  status:
    | 'created'
    | 'updated'
    | 'duplicate'
    | 'skipped'
    | 'unmapped'
    | 'unknown_order'
    | 'noop'
    | 'error'
    | 'busy'
  order_number?: string
  order_id?: string
  detail?: string
}

interface EventRow {
  id: string
  status: string
  attempts: number | null
  locked_until: string | null
  next_attempt_at: string | null
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

function isLeaseActive(row: EventRow, now: number): boolean {
  return Boolean(row.locked_until && new Date(row.locked_until).getTime() > now)
}

function backoffIso(attempts: number): string {
  const minutes = Math.min(2 ** Math.max(attempts - 1, 0), 30)
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function claimEvent(
  supabase: SupabaseClient,
  eventType: string,
  payload: unknown,
  externalOrderId: string,
  eventKey: string
): Promise<{ id: string; attempts: number } | { duplicate: true } | { busy: true } | { exhausted: true }> {
  const { data, error } = await supabase
    .from('integration_events')
    .insert({
      provider: 'grabfood',
      event_type: eventType,
      external_event_id: eventKey,
      external_order_id: externalOrderId,
      payload: redactGrabPayload(payload) as Record<string, unknown>,
      status: 'received',
      attempts: 0,
      locked_until: new Date(Date.now() + LEASE_MS).toISOString(),
      next_attempt_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (!error) return { id: (data as { id: string }).id, attempts: 0 }
  if ((error as { code?: string }).code !== '23505') throw error

  const { data: existing, error: readError } = await supabase
    .from('integration_events')
    .select('id, status, attempts, locked_until, next_attempt_at')
    .eq('provider', 'grabfood')
    .eq('event_type', eventType)
    .eq('external_event_id', eventKey)
    .maybeSingle()
  if (readError) throw readError
  if (!existing) throw error

  return claimExistingEvent(supabase, existing as EventRow)
}

async function claimExistingEvent(
  supabase: SupabaseClient,
  row: EventRow
): Promise<{ id: string; attempts: number } | { duplicate: true } | { busy: true } | { exhausted: true }> {
  if (row.status === 'processed' || row.status === 'skipped') return { duplicate: true }
  if (!['received', 'failed'].includes(row.status)) return { busy: true }
  if ((row.attempts ?? 0) >= MAX_EVENT_ATTEMPTS) return { exhausted: true }

  const now = Date.now()
  if (isLeaseActive(row, now)) return { busy: true }
  if (row.next_attempt_at && new Date(row.next_attempt_at).getTime() > now) {
    return { busy: true }
  }

  const attempts = (row.attempts ?? 0) + 1
  let claim = supabase
    .from('integration_events')
    .update({
      status: 'received',
      error: null,
      attempts,
      locked_until: new Date(now + LEASE_MS).toISOString(),
    })
    .eq('id', row.id)
    .eq('status', row.status)
  claim = row.attempts === null ? claim.is('attempts', null) : claim.eq('attempts', row.attempts)
  claim = row.locked_until === null ? claim.is('locked_until', null) : claim.eq('locked_until', row.locked_until)
  claim = row.next_attempt_at === null ? claim.is('next_attempt_at', null) : claim.eq('next_attempt_at', row.next_attempt_at)
  const { data: claimed, error: updateError } = await claim.select('id').maybeSingle()
  if (updateError) throw updateError
  if (!claimed) return { busy: true }
  return { id: row.id, attempts }
}

async function markProcessed(
  supabase: SupabaseClient,
  eventId: string,
  status: 'processed' | 'skipped',
  attempts: number,
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('integration_events')
    .update({
      status,
      error: errorMessage ?? null,
      processed_at: new Date().toISOString(),
      locked_until: null,
    })
    .eq('id', eventId)
    .eq('attempts', attempts)
}

async function markFailed(
  supabase: SupabaseClient,
  eventId: string,
  attempts: number,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('integration_events')
    .update({
      status: 'failed',
      error: errorMessage,
      attempts,
      locked_until: null,
      next_attempt_at: backoffIso(attempts),
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('attempts', attempts)
}

/** Keep a retryable event `received` so the replay cron and Grab can retry it. */
async function markRetry(
  supabase: SupabaseClient,
  eventId: string,
  attempts: number,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('integration_events')
    .update({
      status: 'received',
      error: errorMessage,
      attempts,
      locked_until: null,
      next_attempt_at: backoffIso(attempts),
    })
    .eq('id', eventId)
    .eq('attempts', attempts)
}

function shouldAttemptAcceptance(payload: GrabSubmitOrderPayload): boolean {
  if (env.GRABFOOD_ACCEPTANCE_MODE !== 'manual') return false
  return (payload.featureFlags?.orderAcceptedType ?? 'MANUAL') === 'MANUAL'
}

/**
 * Accept the order on Grab's side after a successful local import. A Grab-side
 * failure never fails the webhook — the order is already canonical locally —
 * but is recorded for ops because Grab may auto-cancel unaccepted orders.
 */
async function acceptOnGrab(
  supabase: SupabaseClient,
  grab: GrabOrderActions,
  payload: GrabSubmitOrderPayload,
  internalOrderId: string
): Promise<void> {
  try {
    await grab.acceptOrder(payload.orderID, 'Accepted')
    const readyTime =
      payload.orderReadyEstimation?.newOrderReadyTime ??
      payload.orderReadyEstimation?.estimatedOrderReadyTime
    if (
      grab.updateReadyTime &&
      readyTime &&
      payload.orderReadyEstimation?.allowChange !== false
    ) {
      await grab.updateReadyTime(payload.orderID, readyTime)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[GrabFood] accept-order failed:', message)
    await supabase.from('order_events').insert({
      order_id: internalOrderId,
      event_type: 'grabfood_accept_failed',
      new_value: { error: message, external_order_id: payload.orderID },
    })
  }
}

interface ApplyResult {
  status: string
  reason?: string
  order_id?: string
  order_number?: string
}

async function applyOrder(
  supabase: SupabaseClient,
  payload: GrabSubmitOrderPayload,
  eventId: string,
  attempts: number,
  existingOrderNumber?: string
): Promise<HandlerResult> {
  const isEdit = payload.featureFlags?.isMexEditOrder === true

  // Channel product mappings for the GrabFood channel.
  const { data: mappingRows, error: mappingError } = await supabase
    .from('channel_products')
    .select('external_item_id, menu_item_id, external_name, menu_items(name)')
    .eq('channel', 'grabfood')
    .not('external_item_id', 'is', null)
  if (mappingError) throw mappingError

  const mappings = new Map<string, ChannelProductMapping>()
  for (const row of (mappingRows ?? []) as ChannelProductMapping[]) {
    mappings.set(row.external_item_id, row)
  }

  const modifierIds = [...new Set((payload.items ?? []).flatMap((item) =>
    (item.modifiers ?? []).map((modifier) => modifier.id).filter((id): id is string =>
      typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    )
  ))]
  const modifierNames = new Map<string, string>()
  if (modifierIds.length) {
    const { data, error } = await supabase.from('modifiers').select('id, name').in('id', modifierIds)
    if (error) throw error
    for (const row of data ?? []) modifierNames.set(row.id as string, row.name as string)
  }
  const mapped = mapGrabSubmitOrder(payload, mappings, generateOrderNumber(), modifierNames)
  if (!mapped.ok) {
    return { status: 'unmapped', detail: mapped.unmapped.join(', ') }
  }

  const rpcPayload = {
    order: { ...mapped.result.order, ...(existingOrderNumber ? { order_number: existingOrderNumber } : {}) },
    items: mapped.result.items,
    payment: {
      ...mapped.result.payment,
      raw: {
        orderID: payload.orderID,
        paymentType: payload.paymentType,
        price: payload.price,
      },
    },
    channelOrder: {
      ...mapped.result.channelOrder,
      raw_payload: redactGrabPayload(payload),
    },
    isEdit,
    eventType: isEdit ? 'grabfood_order_updated' : 'grabfood_received',
    sourceEventId: eventId,
    sourceEventAttempts: attempts,
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('apply_channel_order', {
    payload: rpcPayload,
  })
  if (rpcError) throw rpcError

  const result = rpcResult as ApplyResult
  if (result.status === 'created' || result.status === 'updated') {
    return {
      status: result.status as 'created' | 'updated',
      order_id: result.order_id,
      order_number: result.order_number,
    }
  }
  if (result.status === 'skipped' || result.status === 'duplicate') {
    return { status: 'duplicate', order_id: result.order_id, order_number: result.order_number }
  }
  return { status: 'error', detail: result.reason ?? result.status }
}

/**
 * Process one Submit Order delivery. `eventId` must already be claimed by the
 * caller; the RPC marks the event processed atomically with the order write.
 */
export async function processSubmitOrder(
  supabase: SupabaseClient,
  payload: GrabSubmitOrderPayload,
  eventId: string,
  attempts: number,
  grab?: GrabOrderActions | null
): Promise<HandlerResult> {
  const isEdit = payload.featureFlags?.isMexEditOrder === true
  if (isEdit) return { status: 'error', detail: 'edit requires authoritative reconciliation' }

  // Order-level idempotency anchor for initial submissions.
  const { data: existing } = await supabase
    .from('channel_orders')
    .select('id, order_id, orders(order_number)')
    .eq('channel', 'grabfood')
    .eq('external_order_id', payload.orderID)
    .maybeSingle()

  if (existing && !isEdit) {
    await markProcessed(supabase, eventId, 'skipped', attempts, 'order already imported')
    const order = existing.orders as { order_number?: string } | null
    return {
      status: 'duplicate',
      order_id: existing.order_id,
      order_number: order?.order_number,
    }
  }

  const result = await applyOrder(
    supabase,
    payload,
    eventId,
    attempts,
    existing ? (existing.orders as { order_number?: string } | null)?.order_number : undefined
  )

  if ((result.status === 'created' || result.status === 'updated') && result.order_id) {
    if (grab && shouldAttemptAcceptance(payload)) {
      await acceptOnGrab(supabase, grab, payload, result.order_id)
    }
  }
  return result
}

async function processOrderState(
  supabase: SupabaseClient,
  payload: GrabOrderStatePayload,
  eventId: string,
  attempts: number
): Promise<HandlerResult> {
  const state = payload.state ?? payload.toState
  if (!state) {
    await markFailed(supabase, eventId, attempts, 'missing state')
    return { status: 'error', detail: 'missing state' }
  }

  const { data: channelOrder, error } = await supabase
    .from('channel_orders')
    .select('id, order_id, external_status, orders(status)')
    .eq('channel', 'grabfood')
    .eq('external_order_id', payload.orderID)
    .maybeSingle()
  if (error) throw error

  if (!channelOrder) {
    // The order may still be in flight (Grab retries state pushes). Keep the
    // event retryable and let Grab/the replay cron try again.
    await markRetry(supabase, eventId, attempts, 'unknown GrabFood order')
    return { status: 'unknown_order' }
  }

  const currentStatus = (channelOrder.orders as { status?: string } | null)?.status ?? 'pending'
  const steps = planInternalTransitions(currentStatus, { ...payload, state })
  const applied: string[] = []
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
    .update({ external_status: state })
    .eq('id', channelOrder.id)

  await markProcessed(supabase, eventId, 'processed', attempts)
  return {
    status: applied.length > 0 ? 'created' : 'noop',
    order_id: channelOrder.order_id,
    detail: applied.length > 0 ? `applied: ${applied.join('->')}` : 'no external kitchen transition',
  }
}

export async function handleSubmitOrder(
  supabase: SupabaseClient,
  payload: GrabSubmitOrderPayload,
  grab?: GrabOrderActions | null,
  eventKey?: string
): Promise<HandlerResult> {
  let eventId: string | null = null
  let attempts = 0
  try {
    const key = eventKey ?? `${payload.orderID}:submit`
    const event = await claimEvent(supabase, 'submit_order', payload, payload.orderID, key)
    if ('duplicate' in event) {
      // An old processed hash cannot prove this is the same edit occurrence.
      if (payload.featureFlags?.isMexEditOrder) {
        return { status: 'error', detail: 'edit requires authoritative reconciliation' }
      }
      return { status: 'duplicate', detail: 'submit_order event already recorded' }
    }
    if ('exhausted' in event) return { status: 'error', detail: 'retry budget exhausted; operator reconciliation required' }
    if ('busy' in event) {
      return { status: 'busy', detail: 'submit_order event is being processed' }
    }
    eventId = event.id
    attempts = event.attempts

    const result = await processSubmitOrder(supabase, payload, eventId, attempts, grab)
    if (result.status === 'unmapped' || result.status === 'error') {
      await markFailed(supabase, eventId, attempts, result.detail ?? result.status)
    }
    return result
  } catch (err) {
    if (eventId) {
      await markFailed(supabase, eventId, attempts, err instanceof Error ? err.message : String(err))
    }
    console.error('[GrabFood] submit-order handler failed:', err)
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

export async function handleOrderState(
  supabase: SupabaseClient,
  payload: GrabOrderStatePayload,
  eventKey?: string
): Promise<HandlerResult> {
  let eventId: string | null = null
  let attempts = 0
  try {
    const state = payload.state ?? payload.toState ?? 'unknown'
    const key = eventKey ?? `${payload.orderID}:${state}`
    const event = await claimEvent(supabase, 'order_state', payload, payload.orderID, key)
    if ('duplicate' in event) {
      return { status: 'duplicate', detail: 'order_state event already recorded' }
    }
    if ('exhausted' in event) return { status: 'error', detail: 'retry budget exhausted; operator reconciliation required' }
    if ('busy' in event) {
      return { status: 'busy', detail: 'order_state event is being processed' }
    }
    eventId = event.id
    attempts = event.attempts

    const result = await processOrderState(supabase, payload, eventId, attempts)
    if (result.status === 'error') {
      await markFailed(supabase, eventId, attempts, result.detail ?? 'state error')
    }
    return result
  } catch (err) {
    if (eventId) {
      await markFailed(supabase, eventId, attempts, err instanceof Error ? err.message : String(err))
    }
    console.error('[GrabFood] order-state handler failed:', err)
    return { status: 'error', detail: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Re-drive an existing integration_events row (crash recovery / failed retry).
 * Claims the row with the same lease rules, then dispatches by event_type.
 */
export async function replayGrabEvent(
  supabase: SupabaseClient,
  event: { id: string; event_type: string; payload: Record<string, unknown>; attempts: number | null },
  grab?: GrabOrderActions | null
): Promise<HandlerResult> {
  const { data: row, error: readError } = await supabase
    .from('integration_events')
    .select('id, status, attempts, locked_until, next_attempt_at')
    .eq('id', event.id)
    .maybeSingle()
  if (readError) throw readError
  if (!row) return { status: 'error', detail: 'event no longer exists' }
  const claim = await claimExistingEvent(supabase, row as EventRow)
  if ('duplicate' in claim) return { status: 'duplicate' }
  if ('exhausted' in claim) return { status: 'error', detail: 'retry budget exhausted; operator reconciliation required' }
  if ('busy' in claim) return { status: 'busy' }
  const attempts = claim.attempts

  if (event.event_type === 'submit_order') {
    const result = await processSubmitOrder(
      supabase,
      event.payload as unknown as GrabSubmitOrderPayload,
      event.id,
      attempts,
      grab
    )
    if (result.status === 'unmapped' || result.status === 'error') {
      await markFailed(supabase, event.id, attempts, result.detail ?? result.status)
    }
    return result
  }
  if (event.event_type === 'order_state') {
    return processOrderState(
      supabase,
      event.payload as unknown as GrabOrderStatePayload,
      event.id,
      attempts
    )
  }
  await markFailed(supabase, event.id, attempts, `unsupported event type ${event.event_type}`)
  return { status: 'error', detail: `unsupported event type ${event.event_type}` }
}
