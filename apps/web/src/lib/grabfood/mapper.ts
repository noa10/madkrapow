/**
 * Mapping between GrabFood payloads and the canonical MadKrapow order model.
 *
 * Money: Grab sends minor units (MYR sen) — values pass through as integers.
 *
 * Revenue semantics for a GrabFood order:
 *   subtotal  = price.subtotal ?? sum(items)          (food value)
 *   discount  = merchantFundPromo + basketPromo       (MERCHANT-funded only —
 *              grabFundPromo is Grab's own money and must not reduce revenue)
 *   total     = subtotal - discount                   (merchant food revenue;
 *              NOT price.total, which includes delivery fee and eater-side
 *              extras — reconciliation nets those separately)
 */

import type { GrabOrderItem, GrabOrderStatePayload, GrabSubmitOrderPayload } from './types'
import { GRAB_STATE_TO_INTERNAL } from './types'

export interface ChannelProductMapping {
  external_item_id: string
  menu_item_id: string
  external_name: string | null
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
    delivery_type: 'delivery' | 'self_pickup'
    fulfillment_type: 'asap'
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
    method: 'grabfood'
    amount_cents: number
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

/**
 * Map a Submit Order payload to the canonical model.
 * @param mappings channel_products rows for channel='grabfood', keyed by external_item_id
 */
export function mapGrabSubmitOrder(
  payload: GrabSubmitOrderPayload,
  mappings: Map<string, ChannelProductMapping>,
  orderNumber: string
): MapGrabOrderResult {
  const items = payload.items ?? []
  const unmapped: string[] = []

  const mappedItems: MappedGrabItem[] = []
  for (const item of items) {
    const externalId = item.merchantItemID ?? item.itemID ?? ''
    const mapping = mappings.get(externalId)
    if (!mapping) {
      unmapped.push(item.merchantItemID ?? item.itemID ?? item.name ?? JSON.stringify(item))
      continue
    }
    const quantity = item.quantity ?? 1
    const unitPriceCents = item.price ?? 0
    const notes = itemNotes(item)
    mappedItems.push({
      menu_item_id: mapping.menu_item_id,
      menu_item_name: mapping.external_name ?? item.name ?? 'GrabFood item',
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
  const discountCents =
    (payload.price?.merchantFundPromo ?? 0) + (payload.price?.basketPromo ?? 0)
  const totalCents = Math.max(subtotalCents - discountCents, 0)

  return {
    ok: true,
    result: {
      order: {
        order_number: orderNumber,
        status: 'paid',
        source: 'grabfood',
        delivery_type: 'delivery',
        fulfillment_type: 'asap',
        subtotal_cents: subtotalCents,
        discount_cents: discountCents,
        delivery_fee_cents: 0,
        total_cents: totalCents,
        customer_name: payload.receiver?.name ?? null,
        notes: payload.orderTime ? `GrabFood order ${payload.orderID}` : null,
        include_cutlery: payload.cutlery ?? true,
      },
      items: mappedItems,
      payment: {
        method: 'grabfood',
        amount_cents: totalCents,
        external_ref: payload.orderID,
      },
      channelOrder: {
        channel: 'grabfood',
        external_order_id: payload.orderID,
        external_order_number: payload.shortOrderNumber ?? null,
        external_store_id: payload.merchantID,
        external_status: 'Accepted',
      },
    },
  }
}

function itemNotes(item: GrabOrderItem): string {
  const parts: string[] = []
  if (item.specifications) parts.push(item.specifications)
  for (const modifier of item.modifiers ?? []) {
    if (modifier.name) {
      parts.push(modifier.quantity && modifier.quantity > 1 ? `${modifier.quantity}x ${modifier.name}` : modifier.name)
    }
  }
  return parts.join(' | ')
}

/**
 * Compute the ordered internal status steps to apply for a Grab order-state
 * push, given the current internal status. Each step is applied with the
 * atomic conditional-update guard; the first failure stops the chain.
 * Returns [] when nothing should change.
 */
export function planInternalTransitions(
  currentStatus: string,
  payload: GrabOrderStatePayload
): Array<'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled'> {
  const target = GRAB_STATE_TO_INTERNAL[payload.toState]
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
  if (fromIndex === -1) {
    // pending/paid/accepted: the kitchen will move it to preparing first.
    return []
  }
  const targetIndex = chain.indexOf(target)
  if (targetIndex <= fromIndex) return []
  return chain.slice(fromIndex + 1, targetIndex + 1)
}
