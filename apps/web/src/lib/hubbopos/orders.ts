import { getServiceClient } from '@/lib/supabase/server';
import { createHubboPosClient } from './client';
import { STATUS_MAP_MADKRAPOW_TO_HUBBOPOS } from './constants';
import type { HubboPosOrderPayload, HubboPosOrderItem, HubboPosOrderResponse } from './types';

export function generateTransId(orderId: string): string {
  return `mk-${orderId}`;
}

export function generateInvoiceNo(orderNumber: string): string {
  return `MK-${orderNumber}`;
}

async function resolveExternalItemId(menuItemId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('menu_items')
    .select('hubbo_pos_external_id')
    .eq('id', menuItemId)
    .single();
  return data?.hubbo_pos_external_id || null;
}

export async function buildOrderPayload(orderId: string): Promise<HubboPosOrderPayload | null> {
  const supabase = getServiceClient();

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (!order) return null;

  const { data: orderItems } = await supabase
    .from('order_items')
    .select('*, order_item_modifiers(*)')
    .eq('order_id', orderId);

  const items: HubboPosOrderItem[] = [];

  for (const item of orderItems || []) {
    const externalItemId = await resolveExternalItemId(item.menu_item_id);

    const modifiers = (item.order_item_modifiers || []).map((mod: Record<string, unknown>) => ({
      modifier_id: mod.modifier_id as string,
      modifier_name: mod.modifier_name as string,
      price_delta: (mod.modifier_price_delta_cents as number) / 100,
    }));

    items.push({
      item_id: externalItemId || item.menu_item_id,
      item_name: item.menu_item_name,
      quantity: item.quantity,
      unit_price: item.menu_item_price_cents / 100,
      line_total: item.line_total_cents / 100,
      notes: item.notes || undefined,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
    });
  }

  const hubboStatus = STATUS_MAP_MADKRAPOW_TO_HUBBOPOS[order.status] || order.status;

  const payload: HubboPosOrderPayload = {
    trans_id: generateTransId(order.id),
    invoice_no: generateInvoiceNo(order.order_number),
    merchant_id: process.env.HUBBOPOS_MERCHANT_ID || '',
    location_id: process.env.HUBBOPOS_LOCATION_ID || undefined,
    order_time: order.created_at,
    status: hubboStatus,
    subtotal: order.subtotal_cents / 100,
    delivery_fee: order.delivery_fee_cents > 0 ? order.delivery_fee_cents / 100 : undefined,
    total: order.total_cents / 100,
    customer_name: order.customer_name || undefined,
    customer_phone: order.customer_phone || undefined,
    order_type: order.delivery_type === 'self_pickup' ? 'self_pickup' : 'delivery',
    scheduled_time: order.scheduled_for || undefined,
    items,
    notes: order.notes || undefined,
    include_cutlery: order.include_cutlery,
  };

  return payload;
}

export async function pushOrderToHubboPos(orderId: string): Promise<{ success: boolean; response?: HubboPosOrderResponse; error?: string }> {
  try {
    const payload = await buildOrderPayload(orderId);
    if (!payload) {
      return { success: false, error: 'Order not found' };
    }

    const client = createHubboPosClient();
    const response = await client.createOrder(payload);

    const supabase = getServiceClient();
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
      .eq('id', orderId);

    return { success: true, response };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRetryable = !(error instanceof Error && (error.name === 'HubboPosValidationError' || error.name === 'HubboPosAuthError'));

    const supabase = getServiceClient();
    await supabase
      .from('orders')
      .update({
        hubbo_pos_sync_status: isRetryable ? 'pending' : 'failed',
        hubbo_pos_last_error: errorMessage,
      })
      .eq('id', orderId);

    if (isRetryable) {
      await supabase.from('hubbopos_sync_queue').insert({
        order_id: orderId,
        action: 'create_order',
        payload: { trans_id: generateTransId(orderId), invoice_no: generateInvoiceNo((await supabase.from('orders').select('order_number').eq('id', orderId).single()).data?.order_number || '') },
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      });
    }

    return { success: false, error: errorMessage };
  }
}

export async function syncOrderStatus(orderId: string, newStatus: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getServiceClient();
    const { data: order } = await supabase
      .from('orders')
      .select('hubbo_pos_trans_id, hubbo_pos_order_id')
      .eq('id', orderId)
      .single();

    if (!order?.hubbo_pos_trans_id) {
      return { success: false, error: 'Order not yet synced to HubboPOS' };
    }

    const hubboStatus = STATUS_MAP_MADKRAPOW_TO_HUBBOPOS[newStatus];
    if (!hubboStatus) {
      return { success: false, error: `Unknown status mapping for: ${newStatus}` };
    }

    await supabase
      .from('orders')
      .update({
        hubbo_pos_sync_status: 'synced',
        hubbo_pos_last_synced_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    const supabase = getServiceClient();
    await supabase.from('hubbopos_sync_queue').insert({
      order_id: orderId,
      action: 'update_status',
      payload: { status: newStatus },
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
    });

    return { success: false, error: errorMessage };
  }
}
