import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
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

    const guard = await requireAdmin(req);
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
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: fetchError ? `Database error: ${fetchError.message}` : 'Order not found' },
        { status: fetchError ? 500 : 404 }
      );
    }

    const expectedNext = ADMIN_VALID_TRANSITIONS[order.status];
    if (!expectedNext || !expectedNext.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition from '${order.status}' to '${newStatus}'. Expected one of: ${expectedNext?.join(', ') ?? 'none'}` },
        { status: 400 }
      );
    }

    const { error: updateError } = await db
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update order', details: updateError.message }, { status: 500 });
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
