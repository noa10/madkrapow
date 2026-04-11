import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerClient, getServiceClient } from '@/lib/supabase/server'

const BulkCheckoutItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().int().positive(), // cents
  quantity: z.number().positive().int(),
  modifiers: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    price_delta_cents: z.number().int(),
  })).default([]),
})

const BulkCheckoutRequestSchema = z.object({
  items: z.array(BulkCheckoutItemSchema).min(1),
  bulkFields: z.object({
    company_name: z.string().min(1),
    requested_date: z.string().min(1),
    requested_time: z.string().min(1),
    budget: z.number().int().min(0).optional(),
    invoice_name: z.string().optional(),
    contact_phone: z.string().min(1),
    special_notes: z.string().optional(),
    dropoff_instructions: z.string().optional(),
  }),
  deliveryAddress: z.object({
    fullName: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().optional(),
    postalCode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
  deliveryType: z.enum(['delivery', 'self_pickup']).default('delivery'),
})

interface BulkCheckoutResponse {
  success: true
  orderId: string
  message: string
}

interface BulkCheckoutError {
  success: false
  error: string
  code?: string
}

type BulkCheckoutResult = BulkCheckoutResponse | BulkCheckoutError

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

export async function POST(req: NextRequest): Promise<NextResponse<BulkCheckoutResult>> {
  try {
    // Use anon client only for auth verification
    const authClient = await getServerClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to place a bulk order', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // Use service client for all DB operations (bypasses RLS for trusted server-side work)
    const supabase = getServiceClient()

    const body = await req.json()
    const parsed = BulkCheckoutRequestSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json(
        { success: false, error: firstError?.message || 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { items, bulkFields, deliveryAddress, deliveryType } = parsed.data

    // Fetch store settings
    const { data: storeSettings } = await supabase
      .from('store_settings')
      .select('bulk_enabled, bulk_threshold_cents, bulk_min_notice_hours, bulk_max_items_per_slot, kitchen_lead_minutes')
      .limit(1)
      .single()

    if (!storeSettings?.bulk_enabled) {
      return NextResponse.json(
        { success: false, error: 'Bulk ordering is not currently available', code: 'BULK_DISABLED' },
        { status: 400 }
      )
    }

    // Validate notice period
    const requestedDateTime = new Date(`${bulkFields.requested_date}T${bulkFields.requested_time}`)
    const now = new Date()
    const hoursUntil = (requestedDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (hoursUntil < (storeSettings.bulk_min_notice_hours ?? 48)) {
      return NextResponse.json(
        { success: false, error: `Minimum ${storeSettings.bulk_min_notice_hours ?? 48} hours notice required for bulk orders`, code: 'INSUFFICIENT_NOTICE' },
        { status: 400 }
      )
    }

    // Resolve customer ID
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    let customerId: string | null = customer?.id ?? null

    if (!customerId) {
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          auth_user_id: user.id,
          name: bulkFields.company_name,
          phone: bulkFields.contact_phone,
        })
        .select('id')
        .single()

      if (customerError || !newCustomer) {
        return NextResponse.json(
          { success: false, error: 'Unable to create customer profile', code: 'CUSTOMER_FAILED' },
          { status: 500 }
        )
      }
      customerId = newCustomer.id
    }

    // Validate prices from DB
    const menuItemIds = items.map(i => i.id)
    const { data: dbItems } = await supabase
      .from('menu_items')
      .select('id, name, price_cents, image_url')
      .in('id', menuItemIds)

    if (!dbItems) {
      return NextResponse.json(
        { success: false, error: 'Unable to validate prices', code: 'PRICE_VALIDATION_FAILED' },
        { status: 500 }
      )
    }

    let subtotalCents = 0

    const validatedItems = items.map(item => {
      const dbItem = dbItems.find(d => d.id === item.id)
      if (!dbItem) throw new Error(`Menu item not found: ${item.id}`)
      const lineTotal = dbItem.price_cents * item.quantity
      subtotalCents += lineTotal
      return { ...item, dbPriceCents: dbItem.price_cents, lineTotalCents: lineTotal, dbName: dbItem.name, dbImageUrl: dbItem.image_url }
    })

    // Create bulk order (no payment yet)
    const orderNumber = generateOrderNumber()
    const deliveryFeeCents = deliveryType === 'self_pickup' ? 0 : 0 // Admin sets this later
    const totalCents = subtotalCents + deliveryFeeCents

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        customer_name: bulkFields.company_name,
        customer_phone: bulkFields.contact_phone,
        status: 'pending',
        subtotal_cents: subtotalCents,
        delivery_fee_cents: deliveryFeeCents,
        total_cents: totalCents,
        delivery_address_json: deliveryType === 'delivery' ? deliveryAddress : null,
        delivery_type: deliveryType,
        fulfillment_type: 'scheduled',
        scheduled_for: requestedDateTime.toISOString(),
        order_kind: 'bulk',
        requires_manual_review: true,
        approval_status: 'pending_review',
        bulk_company_name: bulkFields.company_name,
        bulk_requested_date: requestedDateTime.toISOString(),
        bulk_budget_cents: bulkFields.budget ? bulkFields.budget * 100 : null,
        bulk_invoice_name: bulkFields.invoice_name || null,
        bulk_contact_phone: bulkFields.contact_phone,
        bulk_special_notes: bulkFields.special_notes || null,
        bulk_dropoff_instructions: bulkFields.dropoff_instructions || null,
        dispatch_status: 'not_ready',
        kitchen_lead_minutes: storeSettings.kitchen_lead_minutes ?? 20,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('[API] Failed to create bulk order:', orderError)
      return NextResponse.json(
        { success: false, error: 'Unable to create order. Please try again.', code: 'ORDER_FAILED' },
        { status: 500 }
      )
    }

    // Insert order items
    const orderItems = validatedItems.map(item => ({
      order_id: order.id,
      menu_item_id: item.id,
      menu_item_name: item.dbName,
      menu_item_price_cents: item.dbPriceCents,
      quantity: item.quantity,
      line_total_cents: item.lineTotalCents,
      notes: item.modifiers.length > 0 ? item.modifiers.map(m => m.name).join(', ') : null,
      image_url: item.dbImageUrl || null,
    }))

    const { data: insertedItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)
      .select('id')

    if (itemsError || !insertedItems) {
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { success: false, error: 'Unable to create order items', code: 'ITEMS_FAILED' },
        { status: 500 }
      )
    }

    // Insert order item modifiers
    const orderItemModifiers: Array<{
      order_item_id: string
      modifier_id: string
      modifier_name: string
      modifier_price_delta_cents: number
    }> = []

    validatedItems.forEach((item, itemIndex) => {
      for (const mod of item.modifiers) {
        orderItemModifiers.push({
          order_item_id: insertedItems[itemIndex].id,
          modifier_id: mod.id,
          modifier_name: mod.name,
          modifier_price_delta_cents: mod.price_delta_cents,
        })
      }
    })

    if (orderItemModifiers.length > 0) {
      await supabase.from('order_item_modifiers').insert(orderItemModifiers)
    }

    // Log order event
    await supabase.from('order_events').insert({
      order_id: order.id,
      event_type: 'bulk_submitted',
      new_value: {
        company_name: bulkFields.company_name,
        requested_date: bulkFields.requested_date,
        total_cents: totalCents,
      },
    })

    return NextResponse.json(
      {
        success: true,
        orderId: order.id,
        message: 'Your bulk order has been submitted for review. We will contact you within 24 hours.',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/checkout/bulk:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
