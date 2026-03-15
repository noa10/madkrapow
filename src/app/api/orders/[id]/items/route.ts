import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

interface OrderItemModifier {
  id: string
  modifier_name: string
  modifier_price_delta_cents: number
}

interface OrderItem {
  id: string
  menu_item_id: string
  menu_item_name: string
  menu_item_price_cents: number
  quantity: number
  line_total_cents: number
  notes: string | null
  modifiers: OrderItemModifier[]
}

interface OrderItemsResponse {
  success: true
  orderItems: OrderItem[]
}

interface OrderItemsError {
  success: false
  error: string
}

type OrderItemsResult = OrderItemsResponse | OrderItemsError

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<OrderItemsResult>> {
  try {
    const { id: orderId } = await params
    const supabase = await getServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('auth_user_id')
      .eq('id', order.customer_id)
      .single()

    if (!customer || customer.auth_user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)

    if (itemsError) {
      console.error('[API] Failed to fetch order items:', itemsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch order items' },
        { status: 500 }
      )
    }

    const itemsWithModifiers = await Promise.all(
      (items || []).map(async (item) => {
        const { data: modifiers } = await supabase
          .from('order_item_modifiers')
          .select('id, modifier_name, modifier_price_delta_cents')
          .eq('order_item_id', item.id)

        return {
          id: item.id,
          menu_item_id: item.menu_item_id,
          menu_item_name: item.menu_item_name,
          menu_item_price_cents: item.menu_item_price_cents,
          quantity: item.quantity,
          line_total_cents: item.line_total_cents,
          notes: item.notes,
          modifiers: modifiers || [],
        }
      })
    )

    return NextResponse.json(
      { success: true, orderItems: itemsWithModifiers },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/orders/[id]/items:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
