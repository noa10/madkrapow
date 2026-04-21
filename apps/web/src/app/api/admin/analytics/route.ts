import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { z } from 'zod';

const analyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('7d'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const result = await requireAdmin(req);
    if ('error' in result) return result.error;
    const { supabase } = result;

    const { searchParams } = new URL(req.url);
    const parsed = analyticsQuerySchema.safeParse({
      range: searchParams.get('range') ?? undefined,
      from: searchParams.get('from') ?? undefined,
      to: searchParams.get('to') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { range, from, to } = parsed.data;

    // Calculate date range
    const now = new Date();
    const toDate = to ? new Date(to) : now;
    let fromDate: Date;

    if (from) {
      fromDate = new Date(from);
    } else {
      const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - days);
    }

    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = toDate.toISOString().split('T')[0];

    // Fetch all data in parallel
    const [trendsResult, topItemsResult] = await Promise.all([
      supabase
        .from('daily_order_summary')
        .select('*')
        .gte('order_date', fromDateStr)
        .lte('order_date', toDateStr)
        .order('order_date', { ascending: true }),
      supabase
        .from('top_selling_items')
        .select('*')
        .limit(10),
    ]);

    if (trendsResult.error) {
      return NextResponse.json(
        { error: `Trends query failed: ${trendsResult.error.message}` },
        { status: 500 }
      );
    }
    if (topItemsResult.error) {
      return NextResponse.json(
        { error: `Top items query failed: ${topItemsResult.error.message}` },
        { status: 500 }
      );
    }

    const trends = trendsResult.data ?? [];
    const topItems = topItemsResult.data ?? [];

    // Compute today's pulse from the latest day in trends
    const today = trends.find(
      (t) => t.order_date === now.toISOString().split('T')[0]
    );
    const pulse = today
      ? {
          order_count: today.order_count ?? 0,
          revenue_cents: today.revenue_cents ?? 0,
          avg_order_cents: today.avg_order_cents ?? 0,
          delivery_count: today.delivery_count ?? 0,
          pickup_count: today.pickup_count ?? 0,
        }
      : { order_count: 0, revenue_cents: 0, avg_order_cents: 0, delivery_count: 0, pickup_count: 0 };

    // Compute totals for the range
    const totals = trends.reduce(
      (acc, t) => ({
        order_count: acc.order_count + (t.order_count ?? 0),
        revenue_cents: acc.revenue_cents + (t.revenue_cents ?? 0),
      }),
      { order_count: 0, revenue_cents: 0 }
    );

    return NextResponse.json({
      pulse,
      totals,
      trends,
      top_items: topItems,
    });
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
