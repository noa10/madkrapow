import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

interface Order {
  id: string
  status: string
  total_amount: number
  delivery_fee: number
  created_at: string
  delivery_address: Record<string, unknown>
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
    const supabase = await getServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('orders')
      .select('id, status, total_amount, delivery_fee, created_at, delivery_address')
      .eq('customer_id', user.id)
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

    return NextResponse.json(
      { success: true, orders: orders || [] },
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
