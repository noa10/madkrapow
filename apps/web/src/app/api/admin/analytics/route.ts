import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !value.startsWith('0000-') && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const MAX_RANGE_DAYS = 366;
const analyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).optional().default('7d'),
  from: dateString.optional(),
  to: dateString.optional(),
}).refine(({ from, to }) => (!from && !to) || (!!from && !!to && from <= to))
  .refine(({ from, to }) => !from || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1 <= MAX_RANGE_DAYS);

const itemResultSchema = z.object({
  items_sold: z.number().int().safe().nonnegative(),
  top_items: z.array(z.object({
    menu_item_name: z.string(),
    menu_item_id: z.string().nullable(),
    total_quantity: z.number().int().safe(),
    total_revenue_cents: z.number().int().safe(),
  })).max(10),
});

const sourceResultSchema = z.array(z.object({
  source: z.string(),
  order_count: z.number().int().safe().nonnegative(),
}));

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
      return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.flatten() }, { status: 400 });
    }

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    const { range, from, to } = parsed.data;
    const fromDate = new Date(`${todayStr}T00:00:00.000Z`);
    const days = range === '30d' ? 30 : range === '90d' ? 90 : 7;
    fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
    const fromDateStr = from ?? fromDate.toISOString().slice(0, 10);
    const toDateStr = to ?? todayStr;

    const [todayResult, topItemsResult, sourceResult] = await Promise.all([
      supabase.from('analytics_daily_business_summary').select('*').eq('order_date', todayStr).maybeSingle(),
      supabase.rpc('analytics_top_items', { p_from: fromDateStr, p_to: toDateStr }, { count: 'exact' }),
      supabase.rpc('analytics_order_sources', { p_from: fromDateStr, p_to: toDateStr }),
    ]);
    if (todayResult.error) throw new Error(`Today's query failed: ${todayResult.error.message}`);
    if (topItemsResult.error) throw new Error(`Top items query failed: ${topItemsResult.error.message}`);
    if (sourceResult.error) throw new Error(`Order sources query failed: ${sourceResult.error.message}`);
    const items = itemResultSchema.safeParse(topItemsResult.data);
    if (!items.success) throw new Error('Top items query returned invalid data');
    const sources = sourceResultSchema.safeParse(sourceResult.data);
    if (!sources.success) throw new Error('Order sources query returned invalid data');

    // Explicit counts detect truncated pages; advance by rows actually returned
    // because PostgREST can impose a lower row limit than requested.
    const trends = [];
    let totalRows: number | null = null;
    while (totalRows === null || trends.length < totalRows) {
      const page = await supabase.from('analytics_daily_business_summary')
        .select('*', { count: 'exact' })
        .gte('order_date', fromDateStr).lte('order_date', toDateStr)
        .order('order_date', { ascending: true })
        .range(trends.length, trends.length + 999);
      if (page.error) throw new Error(`Trends query failed: ${page.error.message}`);
      if (page.count === null || !page.data || (totalRows !== null && totalRows !== page.count)) {
        throw new Error('Trends query returned an incomplete result');
      }
      totalRows = page.count;
      if (trends.length + page.data.length > totalRows || (page.data.length === 0 && trends.length < totalRows)) {
        throw new Error('Trends query returned an incomplete result');
      }
      trends.push(...page.data);
    }

    const today = todayResult.data;
    const pulse = {
      order_count: today?.order_count ?? 0,
      revenue_cents: today?.revenue_cents ?? 0,
      avg_order_cents: Math.round(today?.avg_order_cents ?? 0),
      delivery_count: today?.delivery_count ?? 0,
      pickup_count: today?.pickup_count ?? 0,
      dine_in_count: today?.dine_in_count ?? 0,
    };
    const totals = trends.reduce((acc, t) => ({
      order_count: acc.order_count + (t.order_count ?? 0),
      revenue_cents: acc.revenue_cents + (t.revenue_cents ?? 0),
    }), { order_count: 0, revenue_cents: 0 });

    return NextResponse.json({
      range: { from: fromDateStr, to: toDateStr },
      pulse,
      totals,
      trends,
      top_items: items.data.top_items,
      items_sold: items.data.items_sold,
      sources: sources.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
