import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin/require-role';
import { getServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';

const requestSchema = z.object({
  status: z.enum(['preparing', 'ready']),
});

// Only an automatically completed counter take-away keeps a kitchen journey
// after delivery: payment completes the order, then staff cook it. Every
// other order type still moves through /status.
const KITCHEN_TRANSITIONS = {
  paid: 'preparing',
  preparing: 'ready',
} as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const guard = await requireRole(req, ['admin', 'manager', 'kitchen', 'cashier']);
    if ('error' in guard) {
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
      .select('status, source, delivery_type, kitchen_status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[Kitchen Status API] Order lookup failed:', fetchError);
      return NextResponse.json({ error: 'Failed to load order' }, { status: 500 });
    }
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (
      order.source !== 'counter' ||
      order.delivery_type !== 'self_pickup' ||
      order.status !== 'delivered'
    ) {
      return NextResponse.json(
        { error: 'Kitchen status applies only to completed counter self-pickup orders.' },
        { status: 400 }
      );
    }

    const previous = order.kitchen_status as keyof typeof KITCHEN_TRANSITIONS | null;
    if (!previous || KITCHEN_TRANSITIONS[previous] !== newStatus) {
      return NextResponse.json(
        {
          error: `Invalid kitchen transition from '${previous ?? 'none'}' to '${newStatus}'.`,
        },
        { status: 400 }
      );
    }

    // The RPC re-checks eligibility, compares the expected state and writes
    // the audit row in one transaction. The route must not pre-write those
    // tables: a separate update would leave a window with no audit trail.
    const { data, error } = await getServiceClient().rpc('advance_counter_pickup_kitchen', {
      p_order_id: id,
      p_expected: previous,
      p_next: newStatus,
      p_actor_id: user.id,
    });

    if (error) {
      console.error('[Kitchen Status API] RPC failed:', error);
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }

    const result = data as {
      ok?: boolean;
      code?: string;
      kitchen_status?: string;
    } | null;

    if (result?.ok) {
      return NextResponse.json({ success: true, status: newStatus });
    }

    switch (result?.code) {
      case 'invalid_transition':
        return NextResponse.json(
          { error: `Invalid kitchen transition from '${previous}' to '${newStatus}'.` },
          { status: 400 }
        );
      case 'conflict':
      // The pre-read succeeded, so `not_found` means the order stopped being
      // an eligible counter pickup (or was removed) between the read and the
      // RPC. Both are concurrent state changes.
      case 'not_found':
        return NextResponse.json(
          { error: 'Order state changed; refresh and retry.' },
          { status: 409 }
        );
      default:
        console.error('[Kitchen Status API] Unexpected RPC result:', result);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
  } catch (error) {
    console.error('[Kitchen Status API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
