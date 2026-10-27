import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin/require-role';
import { ADMIN_VALID_TRANSITIONS } from '@/lib/orders/status';
import { z } from 'zod';

const requestSchema = z.object({
  status: z.string(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // All staff roles may advance a ticket: the merchant app has always shown
    // these buttons to cashier/kitchen, and RLS `staff_all_orders` already
    // permits the write. The canonical transition map below is the real gate.
    // This is required for the dine-in flow to finish without an admin on
    // shift: settle (cashier) → preparing/ready (kitchen) → close table
    // (cashier).
    const guard = await requireRole(req, ['admin', 'manager', 'kitchen', 'cashier']);
    if ("error" in guard) {
      return guard.error;
    }

    const { user, supabase: db } = guard;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request', details: validation.error.flatten() }, { status: 400 });
    }

    const { status: newStatus } = validation.data;

    const { data: order, error: fetchError } = await db
      .from('orders')
      .select('status, delivery_type, source')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: fetchError ? `Database error: ${fetchError.message}` : 'Order not found' },
        { status: fetchError ? 500 : 404 }
      );
    }

    // Every staff role may move kitchen state (paid → preparing → ready), but
    // money-state and destructive transitions stay with admins/managers.
    const actorRole = user.app_metadata?.role as string | undefined;
    const isManagerial = actorRole === 'admin' || actorRole === 'manager';
    const isPosOrder =
      order.source === 'counter' || order.delivery_type === 'dine_in';

    // POS/table orders become paid only through the settle RPC, which writes
    // the payments row atomically. Allowing a bare status write here would
    // produce a paid order with no money record.
    if (newStatus === 'paid' && order.status === 'pending' && isPosOrder) {
      return NextResponse.json(
        {
          error:
            'Collect payment through the POS settle flow (it records a payments row).',
        },
        { status: 403 }
      );
    }

    // Cashiers collect table-QR/pay-later payments through the POS settle
    // route, which writes a payments row — not by marking an order paid here.
    if (!isManagerial && newStatus === 'paid' && order.status === 'pending') {
      return NextResponse.json(
        {
          error:
            'Only an admin or manager can mark an order paid manually. Use the POS to collect payment.',
        },
        { status: 403 }
      );
    }
    // A cashier alone on shift must be able to clear an abandoned unpaid
    // ticket (diner left / mis-ordered / pay-later take-away never collected)
    // without waiting for a manager. The void is scoped to pending dine-in or
    // POS counter orders; everything else still needs a manager.
    const canVoidPendingPosOrder =
      actorRole === 'cashier' &&
      order.status === 'pending' &&
      (order.delivery_type === 'dine_in' || order.source === 'counter') &&
      newStatus === 'cancelled';
    if (!isManagerial && newStatus === 'cancelled' && !canVoidPendingPosOrder) {
      return NextResponse.json(
        { error: 'Only an admin or manager can cancel an order.' },
        { status: 403 }
      );
    }

    const expectedNext = ADMIN_VALID_TRANSITIONS[order.status];
    if (!expectedNext || !expectedNext.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition from '${order.status}' to '${newStatus}'. Expected one of: ${expectedNext?.join(', ') ?? 'none'}` },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await db
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      // Optimistic concurrency: a concurrent settle/void may have moved the
      // order since the read above. Never overwrite that state.
      .eq('status', order.status)
      .select('id');

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update order', details: updateError.message }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'Order state changed; refresh and retry.' },
        { status: 409 }
      );
    }

    await db.from('order_events').insert({
      order_id: id,
      event_type: 'status_changed',
      old_value: { status: order.status },
      new_value: { status: newStatus },
      actor_id: user.id,
    });

    // Notify bot customers of status changes (best-effort, non-blocking)
    try {
      const { sendOrderStatusNotification } = await import('@/lib/bots/order-notifications')
      await sendOrderStatusNotification(id, newStatus)
    } catch {
      // Notification failure must not break the order update
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('[Status API] Unexpected error:', error);
    const errorMessage =
      error instanceof Error ? error.message :
      typeof error === 'string' ? error :
      typeof error === 'object' && error !== null && 'message' in error ? String((error as Record<string, unknown>).message) :
      'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
