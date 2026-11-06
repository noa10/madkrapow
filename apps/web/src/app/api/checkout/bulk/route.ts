import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { sanitizeForLog } from '@/lib/logging/safe-log'
import { getAuthenticatedUser, getServiceClient } from '@/lib/supabase/server'

const BulkCheckoutItemSchema = z.object({
  // Seeded menu IDs are GUID-shaped but do not have RFC version bits.
  id: z.guid(),
  name: z.string().min(1),
  price: z.number().int().positive(), // cents; the server re-prices the item
  quantity: z.number().positive().int().max(1000),
  modifiers: z.array(z.object({
    id: z.guid(),
    name: z.string().min(1),
    price_delta_cents: z.number().int(),
  })).max(20).default([]),
})

const BulkCheckoutRequestSchema = z.object({
  items: z.array(BulkCheckoutItemSchema).min(1).max(100),
  bulkFields: z.object({
    company_name: z.string().min(1),
    requested_date: z.string().min(1),
    requested_time: z.string().min(1),
    budget: z.number().int().min(0).max(1_000_000).optional(), // RM; converted to cents below
    invoice_name: z.string().optional(),
    contact_phone: z.string().min(1),
    special_notes: z.string().optional(),
    dropoff_instructions: z.string().optional(),
  }),
  deliveryAddress: z.object({
    fullName: z.string().optional(),
    phone: z.string().optional(),
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
    // Authenticate cookie and Bearer requests before using any privileged RPC.
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to place a bulk order', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    if (!user.email_confirmed_at) {
      return NextResponse.json(
        { success: false, error: 'Please verify your email address to continue with checkout', code: 'EMAIL_NOT_VERIFIED' },
        { status: 403 }
      )
    }

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

    const requestedDateTime = new Date(`${bulkFields.requested_date}T${bulkFields.requested_time}`)
    if (!Number.isFinite(requestedDateTime.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid requested date or time', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }
    const hoursUntil = (requestedDateTime.getTime() - Date.now()) / (1000 * 60 * 60)
    if (hoursUntil < (storeSettings.bulk_min_notice_hours ?? 48)) {
      return NextResponse.json(
        { success: false, error: `Minimum ${storeSettings.bulk_min_notice_hours ?? 48} hours notice required for bulk orders`, code: 'INSUFFICIENT_NOTICE' },
        { status: 400 }
      )
    }

    const { data: customer, error: lookupError } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json(
        { success: false, error: 'Unable to create customer profile', code: 'CUSTOMER_FAILED' },
        { status: 500 }
      )
    }

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

    // Reject missing/sold-out dishes before submission. The RPC re-reads and
    // locks their prices and modifier metadata when it writes the snapshots.
    const menuItemIds = items.map(item => item.id)
    const { data: dbItems, error: priceError } = await supabase
      .from('menu_items')
      .select('id, name, price_cents, image_url, is_available')
      .in('id', menuItemIds)

    if (priceError || !dbItems) {
      return NextResponse.json(
        { success: false, error: 'Unable to validate prices', code: 'PRICE_VALIDATION_FAILED' },
        { status: 500 }
      )
    }

    const unavailableItem = dbItems.find(item => !item.is_available)
    if (unavailableItem) {
      return NextResponse.json(
        { success: false, error: `${unavailableItem.name} is no longer available`, code: 'ITEM_UNAVAILABLE' },
        { status: 400 }
      )
    }
    if (items.some(item => !dbItems.some(dbItem => dbItem.id === item.id))) {
      return NextResponse.json(
        { success: false, error: 'An item is no longer available', code: 'ITEM_UNAVAILABLE' },
        { status: 400 }
      )
    }

    const service = getServiceClient()
    const { data: order, error: orderError } = await service.rpc('submit_bulk_order', {
      p_auth_user_id: user.id,
      p_customer_id: customerId,
      p_order: {
        order_number: generateOrderNumber(),
        company_name: bulkFields.company_name,
        contact_phone: bulkFields.contact_phone,
        delivery_type: deliveryType,
        delivery_address: deliveryAddress,
        scheduled_for: requestedDateTime.toISOString(),
        requested_date: bulkFields.requested_date,
        budget_cents: bulkFields.budget ? bulkFields.budget * 100 : null,
        invoice_name: bulkFields.invoice_name || null,
        special_notes: bulkFields.special_notes || null,
        dropoff_instructions: bulkFields.dropoff_instructions || null,
        kitchen_lead_minutes: storeSettings.kitchen_lead_minutes ?? 20,
      },
      // Names and prices received from the client never cross the RPC boundary.
      p_items: items.map(item => ({
        menu_item_id: item.id,
        quantity: item.quantity,
        modifier_ids: item.modifiers.map(modifier => modifier.id),
      })),
    })

    if (orderError?.message === 'bulk_items_failed') {
      console.error('[API] Failed to create bulk order items:', sanitizeForLog(orderError.details))
      return NextResponse.json(
        { success: false, error: 'Unable to create order items', code: 'ITEMS_FAILED' },
        { status: 500 }
      )
    }
    if (orderError?.message === 'bulk_item_unavailable') {
      return NextResponse.json(
        { success: false, error: 'An item is no longer available', code: 'ITEM_UNAVAILABLE' },
        { status: 400 }
      )
    }
    if (orderError?.message === 'bulk_invalid_modifier') {
      return NextResponse.json(
        { success: false, error: 'An item option is no longer available', code: 'MODIFIER_UNAVAILABLE' },
        { status: 400 }
      )
    }
    if (
      orderError?.message === 'bulk_invalid_order' ||
      orderError?.message === 'bulk_invalid_items' ||
      orderError?.message === 'bulk_invalid_item' ||
      orderError?.message === 'bulk_total_too_large'
    ) {
      return NextResponse.json(
        { success: false, error: 'This order is too large. Please split it or contact us.', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }
    if (orderError?.message === 'bulk_customer_mismatch') {
      return NextResponse.json(
        { success: false, error: 'Please sign in again to place this order', code: 'UNAUTHORIZED' },
        { status: 403 }
      )
    }
    if (orderError || !order || typeof order.order_id !== 'string') {
      console.error('[API] Failed to create bulk order:', sanitizeForLog(orderError?.message))
      return NextResponse.json(
        { success: false, error: 'Unable to create order. Please try again.', code: 'ORDER_FAILED' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        orderId: order.order_id,
        message: 'Your bulk order has been submitted for review. We will contact you within 24 hours.',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/checkout/bulk:', sanitizeForLog(error instanceof Error ? error.message : error))
    return NextResponse.json(
      { success: false, error: 'Unable to create order. Please try again.', code: 'ORDER_FAILED' },
      { status: 500 }
    )
  }
}
