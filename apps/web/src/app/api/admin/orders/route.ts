import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/admin/require-role';
import { z } from 'zod';

const ordersQuerySchema = z.object({
  source: z.enum(['web', 'telegram', 'whatsapp', 'mobile']).optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(200),
  offset: z.coerce.number().min(0).optional().default(0),
});

export async function GET(req: NextRequest) {
  try {
    const result = await requireRole(req, ['admin', 'manager', 'cashier']);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { searchParams } = new URL(req.url);
    const parsed = ordersQuerySchema.safeParse({
      source: searchParams.get('source') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { source, status, limit, offset } = parsed.data;

    let query = supabase
      .from('orders')
      .select('*, order_items(quantity), source, customer_id')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      query = query.eq('source', source);
    }

    if (status) {
      const statuses = status.split(',');
      query = query.in('status', statuses);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: `Orders query failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ orders: data ?? [], count: (data ?? []).length });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
