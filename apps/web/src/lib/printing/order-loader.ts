/**
 * Load a canonical order as a PrintOrder for the print job builders.
 *
 * Unit prices come from order_items snapshots (never recomputed); GrabFood
 * orders carry the channel short number from channel_orders; the payment
 * method drives the receipt's Payment row and the bridge's cash-drawer kick.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrintOrder, PrintOrderItem } from './jobs'

const FULFILLMENT_LABELS: Record<string, string> = {
  self_pickup: 'Takeaway',
  dine_in: 'Dine In',
  delivery: 'Delivery',
}

export async function loadPrintOrder(
  supabase: SupabaseClient,
  orderId: string
): Promise<PrintOrder | null> {
  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, source, status, created_at, customer_name, subtotal_cents, total_cents, notes, delivery_type'
    )
    .eq('id', orderId)
    .maybeSingle()
  if (error || !order) return null

  const { data: itemRows, error: itemsError } = await supabase
    .from('order_items')
    .select('id, menu_item_name, menu_item_price_cents, quantity, line_total_cents, notes')
    .eq('order_id', orderId)
  if (itemsError) throw itemsError

  const itemIds = (itemRows ?? []).map((row) => row.id as string)
  const modifiersByItem = new Map<string, string[]>()
  if (itemIds.length > 0) {
    const { data: modifierRows, error: modifiersError } = await supabase
      .from('order_item_modifiers')
      .select('order_item_id, modifier_name')
      .in('order_item_id', itemIds)
    if (modifiersError) throw modifiersError
    for (const row of modifierRows ?? []) {
      const list = modifiersByItem.get(row.order_item_id as string) ?? []
      list.push(row.modifier_name as string)
      modifiersByItem.set(row.order_item_id as string, list)
    }
  }

  const items: PrintOrderItem[] = (itemRows ?? []).map((row) => ({
    name: row.menu_item_name as string,
    quantity: row.quantity as number,
    priceCents: row.menu_item_price_cents as number,
    notes: (row.notes as string | null) ?? undefined,
    modifiers: (modifiersByItem.get(row.id as string) ?? []).map((name) => ({ name, quantity: 1 })),
  }))

  let externalOrderNumber: string | undefined
  if (order.source === 'grabfood') {
    const { data: channelOrder } = await supabase
      .from('channel_orders')
      .select('external_order_number')
      .eq('channel', 'grabfood')
      .eq('order_id', orderId)
      .maybeSingle()
    externalOrderNumber = channelOrder?.external_order_number ?? undefined
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('method')
    .eq('order_id', orderId)
    .eq('status', 'succeeded')
    .maybeSingle()

  return {
    orderNumber: order.order_number as string,
    source: order.source as string,
    externalOrderNumber,
    createdAt: order.created_at as string,
    customerName: (order.customer_name as string | null) ?? null,
    orderNotes: (order.notes as string | null) ?? null,
    items,
    subtotalCents: order.subtotal_cents as number,
    totalCents: order.total_cents as number,
    paymentMethod: (payment?.method as string | null) ?? null,
    fulfillmentLabel: order.delivery_type
      ? FULFILLMENT_LABELS[order.delivery_type as string]
      : undefined,
  }
}
