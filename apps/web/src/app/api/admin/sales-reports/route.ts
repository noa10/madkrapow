import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { z } from 'zod'
import {
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns'

type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'thisWeek'
  | 'thisMonth'
  | 'custom'

function getDateRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date } {
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = startOfDay(subDays(now, 1))

  switch (preset) {
    case 'today':
      return { start: today, end: endOfDay(now) }
    case 'yesterday':
      return { start: yesterday, end: endOfDay(yesterday) }
    case 'last7days':
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) }
    case 'last30days':
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) }
    case 'thisWeek':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      }
    case 'thisMonth':
      return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'custom':
      return {
        start: startOfDay(new Date(customStart || now.toISOString())),
        end: endOfDay(new Date(customEnd || now.toISOString())),
      }
    default:
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) }
  }
}

const salesReportQuerySchema = z.object({
  preset: z
    .enum([
      'today',
      'yesterday',
      'last7days',
      'last30days',
      'thisWeek',
      'thisMonth',
      'custom',
    ])
    .optional()
    .default('last7days'),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const result = await requireAdmin(req)
    if ('error' in result) return result.error
    const { supabase } = result

    const { searchParams } = new URL(req.url)
    const parsed = salesReportQuerySchema.safeParse({
      preset: searchParams.get('preset') ?? undefined,
      start: searchParams.get('start') ?? undefined,
      end: searchParams.get('end') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { preset, start, end } = parsed.data
    const { start: startDate, end: endDate } = getDateRange(
      preset,
      start,
      end,
    )

    const startISO = startDate.toISOString()
    const endISO = endDate.toISOString()

    const validStatuses = ['paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered']

    console.log('[Sales Reports] Query params:', { preset, startISO, endISO, validStatuses })

    // Fetch orders first so we can filter order_items by their IDs
    const ordersRes = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', startISO)
      .lte('created_at', endISO)
      .in('status', validStatuses)

    if (ordersRes.error) {
      console.error('[Sales Reports] Orders query failed:', ordersRes.error.message)
      return NextResponse.json(
        { error: `Orders query failed: ${ordersRes.error.message}` },
        { status: 500 },
      )
    }

    const orders = ordersRes.data ?? []
    console.log('[Sales Reports] Orders found:', orders.length)
    const orderIds = orders.map((o: { id: string }) => o.id)

    // Fetch order_items only for the orders in range (avoids full-table scan)
    let orderItems: Record<string, unknown>[] = []
    if (orderIds.length > 0) {
      const orderItemsRes = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds)

      if (orderItemsRes.error) {
        console.error('[Sales Reports] Order items query failed:', orderItemsRes.error.message)
      }
      orderItems = orderItemsRes.data ?? []
      console.log('[Sales Reports] Order items found:', orderItems.length)
    }

    // Categories and menu_items are small reference tables — fetch in parallel
    const [categoriesRes, menuItemsRes] = await Promise.all([
      supabase.from('categories').select('id, name').eq('is_active', true),
      supabase.from('menu_items').select('id, category_id, name'),
    ])

    if (categoriesRes.error) {
      console.error('[Sales Reports] Categories query failed:', categoriesRes.error.message)
    }
    if (menuItemsRes.error) {
      console.error('[Sales Reports] Menu items query failed:', menuItemsRes.error.message)
    }

    console.log('[Sales Reports] Categories:', (categoriesRes.data ?? []).length, 'MenuItems:', (menuItemsRes.data ?? []).length)

    return NextResponse.json({
      orders,
      orderItems,
      categories: categoriesRes.data ?? [],
      menuItems: menuItemsRes.data ?? [],
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Internal server error'
    console.error('[Sales Reports] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
