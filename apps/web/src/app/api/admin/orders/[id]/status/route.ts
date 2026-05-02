import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { z } from 'zod';

const VALID_TRANSITIONS: Record<string, string> = {
  paid: 'accepted',
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'picked_up',
  picked_up: 'delivered',
};

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

    const expectedNext = VALID_TRANSITIONS[order.status];
    if (!expectedNext || newStatus !== expectedNext) {
      return NextResponse.json(
        { error: `Invalid transition from '${order.status}' to '${newStatus}'. Expected: '${expectedNext}'` },
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
