import { getServiceClient } from '@/lib/supabase/server';

export interface PaymentReconciliationResult {
  localPaidCount: number;
  localPaidTotalCents: number;
  hubboPaidCount: number;
  hubboPaidTotalCents: number;
  mismatches: Array<{
    orderId: string;
    orderNumber: string;
    issue: string;
    localTotalCents: number;
    hubboTotalCents: number | null;
  }>;
}

export async function reconcilePayments(
  timeAfter: string,
  timeBefore: string
): Promise<PaymentReconciliationResult> {
  const supabase = getServiceClient();

  const { data: localOrders } = await supabase
    .from('orders')
    .select('id, order_number, total_cents, status, hubbo_pos_order_id, hubbo_pos_sync_status')
    .gte('created_at', timeAfter)
    .lte('created_at', timeBefore)
    .in('status', ['paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered']);

  const result: PaymentReconciliationResult = {
    localPaidCount: localOrders?.length || 0,
    localPaidTotalCents: localOrders?.reduce((sum, o) => sum + (o.total_cents || 0), 0) || 0,
    hubboPaidCount: 0,
    hubboPaidTotalCents: 0,
    mismatches: [],
  };

  const syncedOrders = (localOrders || []).filter((o) => o.hubbo_pos_sync_status === 'synced');
  const unsyncedOrders = (localOrders || []).filter((o) => o.hubbo_pos_sync_status !== 'synced');

  result.hubboPaidCount = syncedOrders.length;
  result.hubboPaidTotalCents = syncedOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);

  for (const order of unsyncedOrders) {
    result.mismatches.push({
      orderId: order.id,
      orderNumber: order.order_number,
      issue: 'not_synced_to_hubbopos',
      localTotalCents: order.total_cents,
      hubboTotalCents: null,
    });
  }

  return result;
}

export async function pullOrdersForReconciliation(
  timeAfter: string,
  timeBefore: string
): Promise<{ ordersPulled: number; reconciliationSnapshot: Record<string, unknown> }> {
  const supabase = getServiceClient();

  const { data: localOrders } = await supabase
    .from('orders')
    .select('id, order_number, total_cents, status, created_at, hubbo_pos_sync_status')
    .gte('created_at', timeAfter)
    .lte('created_at', timeBefore)
    .in('status', ['paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered']);

  return {
    ordersPulled: localOrders?.length || 0,
    reconciliationSnapshot: {
      timeAfter,
      timeBefore,
      localOrderCount: localOrders?.length || 0,
      localTotalCents: localOrders?.reduce((sum, o) => sum + (o.total_cents || 0), 0) || 0,
      syncedCount: (localOrders || []).filter((o) => o.hubbo_pos_sync_status === 'synced').length,
      pendingCount: (localOrders || []).filter((o) => o.hubbo_pos_sync_status === 'pending').length,
      failedCount: (localOrders || []).filter((o) => o.hubbo_pos_sync_status === 'failed').length,
    },
  };
}
