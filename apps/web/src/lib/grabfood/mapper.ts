/**
 * Mapping between GrabFood payloads and the canonical MadKrapow order model.
 *
 * Money: Grab sends minor units (MYR sen) — values pass through as integers.
 *
 * Revenue semantics for a GrabFood order:
 *   subtotal = price.subtotal ?? sum(items)       (food value, tax-inclusive)
 *   discount = price.merchantFundPromo            (MERCHANT-funded only)
 *   total    = subtotal - discount                (merchant food revenue)
 *
 * `basketPromo` is deliberately ignored: Grab's own example sets it to
 * grabFundPromo + merchantFundPromo, so subtracting it as well would
 * double-count the merchant-funded discount. `price.total` includes delivery
 * fees and eater-side extras and is not merchant revenue.
 */

import type { GrabOrderItem, GrabOrderStatePayload, GrabSubmitOrderPayload } from './types'
import { GRAB_STATE_TO_INTERNAL, GRAB_STATES_WITHOUT_KITCHEN_TRANSITION } from './types'

export interface ChannelProductMapping {
  external_item_id: string
  menu_item_id: string
  external_name: string | null
  menu_items?: { name: string } | { name: string }[] | null
}

export interface MappedGrabItem {
  menu_item_id: string
  menu_item_name: string
  menu_item_price_cents: number
  quantity: number
  line_total_cents: number
  notes: string | null
}

export interface MappedGrabOrder {
  order: {
    order_number: string
    status: 'paid'
    source: 'grabfood'
    delivery_type: 'delivery' | 'self_pickup' | 'dine_in'
    fulfillment_type: 'asap' | 'scheduled'
    scheduled_for: string | null
    subtotal_cents: number
    discount_cents: number
    delivery_fee_cents: number
    total_cents: number
    customer_name: string | null
    notes: string | null
    include_cutlery: boolean
  }
  items: MappedGrabItem[]
  payment: {
    method: 'cash' | 'grabfood'
    amount_cents: number
    status: 'pending' | 'succeeded'
    external_ref: string
  }
  channelOrder: {
    channel: 'grabfood'
    external_order_id: string
    external_order_number: string | null
    external_store_id: string
    external_status: string
  }
}

export type MapGrabOrderResult =
  | { ok: true; result: MappedGrabOrder }
  | { ok: false; unmapped: string[] }

/** Grab sends the partner item id as `items[].id`. */
export function grabItemExternalId(item: GrabOrderItem & { merchantItemID?: string; itemID?: string }): string {
  return item.id ?? item.merchantItemID ?? item.itemID ?? ''
}

/**
 * Map a Submit Order payload to the canonical model.
 * @param mappings channel_products rows for channel='grabfood', keyed by external_item_id
 */
export function mapGrabSubmitOrder(
  payload: GrabSubmitOrderPayload,
  mappings: Map<string, ChannelProductMapping>,
  orderNumber: string,
  modifierNames: ReadonlyMap<string, string> = new Map()
): MapGrabOrderResult {
  const items = payload.items ?? []
  const unmapped: string[] = []

  const mappedItems: MappedGrabItem[] = []
  for (const item of items) {
    const externalId = grabItemExternalId(item)
    const mapping = mappings.get(externalId)
    if (!mapping) {
      unmapped.push(externalId || JSON.stringify(item))
      continue
    }
    const localItem = Array.isArray(mapping.menu_items) ? mapping.menu_items[0] : mapping.menu_items
    const name = mapping.external_name?.trim() || localItem?.name?.trim()
    if (!name) {
      unmapped.push(`item name: ${externalId}`)
      continue
    }
    const unknownModifiers = (item.modifiers ?? []).filter((modifier) => !modifier.id || !modifierNames.get(modifier.id)?.trim())
    if (unknownModifiers.length) {
      unmapped.push(...unknownModifiers.map((modifier) => `modifier: ${modifier.id || '(missing ID)'}`))
      continue
    }
    const quantity = item.quantity ?? 1
    const unitPriceCents = item.price ?? 0
    const notes = itemNotes(item, modifierNames)
    mappedItems.push({
      menu_item_id: mapping.menu_item_id,
      menu_item_name: name,
      menu_item_price_cents: unitPriceCents,
      quantity,
      line_total_cents: unitPriceCents * quantity,
      notes: notes || null,
    })
  }

  if (unmapped.length > 0) {
    return { ok: false, unmapped }
  }

  const itemsSumCents = mappedItems.reduce((a, i) => a + i.line_total_cents, 0)
  const subtotalCents = payload.price?.subtotal ?? itemsSumCents
  const discountCents = payload.price?.merchantFundPromo ?? 0
  const totalCents = Math.max(subtotalCents - discountCents, 0)

  const orderType = payload.featureFlags?.orderType
  const deliveryType: MappedGrabOrder['order']['delivery_type'] =
    orderType === 'DineIn' || orderType === 'ScanToOrder' || orderType === 'PosDineOutOrder'
      ? 'dine_in'
      : orderType === 'TakeAway' || orderType === 'TakeAwayOrder'
        ? 'self_pickup'
        : 'delivery'

  const isCash = payload.paymentType === 'CASH'

  return {
    ok: true,
    result: {
      order: {
        order_number: orderNumber,
        status: 'paid',
        source: 'grabfood',
        delivery_type: deliveryType,
        fulfillment_type: payload.scheduledTime ? 'scheduled' : 'asap',
        scheduled_for: payload.scheduledTime ?? null,
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        delivery_fee_cents: 0,
        total_cents: totalCents,
        customer_name: payload.receiver?.name ?? null,
        notes: orderNotes(payload),
        include_cutlery: payload.cutlery ?? true,
      },
      items: mappedItems,
      payment: {
        method: isCash ? 'cash' : 'grabfood',
        amount_cents: totalCents,
        status: isCash ? 'pending' : 'succeeded',
        external_ref: payload.orderID,
      },
      channelOrder: {
        channel: 'grabfood',
        external_order_id: payload.orderID,
        external_order_number: payload.shortOrderNumber ?? null,
        external_store_id: payload.merchantID,
        external_status: payload.featureFlags?.orderAcceptedType === 'MANUAL' ? 'PENDING' : 'ACCEPTED',
      },
    },
  }
}

function itemNotes(item: GrabOrderItem, modifierNames: ReadonlyMap<string, string>): string {
  const parts: string[] = []
  if (item.specifications) parts.push(item.specifications)
  for (const modifier of item.modifiers ?? []) {
    if (modifier.id) {
      const qty = modifier.quantity && modifier.quantity > 1 ? `${modifier.quantity}x ` : ''
      parts.push(`${qty}${modifierNames.get(modifier.id)}`)
    }
  }
  return parts.join(' | ')
}

function orderNotes(payload: GrabSubmitOrderPayload): string {
  const ref = payload.shortOrderNumber
    ? `GrabFood ${payload.shortOrderNumber} (${payload.orderID})`
    : `GrabFood order ${payload.orderID}`
  const parts = [ref]
  if (payload.scheduledTime) parts.push(`scheduled ${payload.scheduledTime}`)
  return parts.join(' · ')
}

/**
 * Compute the ordered internal status steps to apply for a Grab order-state
 * push, given the current internal status. Each step is applied with the
 * atomic conditional-update guard; the first failure stops the chain.
 *
 * ACCEPTED / DRIVER_ALLOCATED / DRIVER_ARRIVED / BILL_PAID are external-only:
 * driver arrival must never be treated as kitchen completion.
 * Returns [] when nothing should change.
 */
export function planInternalTransitions(
  currentStatus: string,
  payload: GrabOrderStatePayload
): Array<'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled'> {
  const state = payload.state ?? payload.toState
  if (!state) return []
  if (GRAB_STATES_WITHOUT_KITCHEN_TRANSITION.has(state)) return []

  const target = GRAB_STATE_TO_INTERNAL[state]
  if (!target) return []

  if (target === 'cancelled') {
    // Only non-terminal, cancellable statuses may move to cancelled.
    const cancellable = ['pending', 'paid', 'accepted', 'preparing', 'ready']
    return cancellable.includes(currentStatus) ? ['cancelled'] : []
  }

  const chain: Array<'preparing' | 'ready' | 'picked_up' | 'delivered'> = [
    'preparing',
    'ready',
    'picked_up',
    'delivered',
  ]
  const fromIndex = chain.indexOf(currentStatus as (typeof chain)[number])
  const targetIndex = chain.indexOf(target)
  if (targetIndex < 0) return []
  // pending/paid/accepted start before the chain; this catches the order up
  // through every required state rather than skipping the guard.
  if (fromIndex === -1 && !['pending', 'paid', 'accepted'].includes(currentStatus)) return []
  const startIndex = fromIndex === -1 ? 0 : fromIndex + 1
  if (targetIndex < startIndex) return []
  return chain.slice(startIndex, targetIndex + 1)
}
