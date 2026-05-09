import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/server'

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
  fulfillment_type: string
  include_cutlery: boolean
  item_count: number
}

interface OrdersResponse {
  success: true
  orders: Order[]
}

interface OrdersError {
  success: false
  error: string
}

type OrdersResult = OrdersResponse | OrdersError

export async function GET(req: NextRequest): Promise<NextResponse<OrdersResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    // Resolve customer_id from auth user
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: true, orders: [] },
        { status: 200 }
      )
    }

    let query = supabase
      .from('orders')
      .select('id, status, total_cents, delivery_fee_cents, created_at, delivery_address_json, delivery_type, fulfillment_type, include_cutlery')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data: orders, error } = await query

    if (error) {
      console.error('[API] Failed to fetch orders:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch orders' },
        { status: 500 }
      )
    }

    const orderList = orders || []

    // Fetch item counts
    const counts: Record<string, number> = {}
    if (orderList.length > 0) {
      const orderIds = orderList.map((o) => o.id)
      const { data: items } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', orderIds)

      for (const row of items || []) {
        const oid = row.order_id as string
        const qty = (row.quantity as number) || 1
        counts[oid] = (counts[oid] || 0) + qty
      }
    }

    const ordersWithCounts = orderList.map((order) => ({
      ...order,
      item_count: counts[order.id] || 0,
    }))

    return NextResponse.json(
      { success: true, orders: ordersWithCounts },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/orders:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
