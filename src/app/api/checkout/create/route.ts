import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '@/lib/validators/env'
import { getServerClient, getServiceClient } from '@/lib/supabase/server'

const CheckoutItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  price: z.number().int().positive(), // cents
  quantity: z.number().positive().int(),
  image: z.string().optional(),
  modifiers: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    price_delta_cents: z.number().int(),
  })).default([]),
})

const CheckoutRequestSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  deliveryAddress: z.object({
    fullName: z.string().min(1, 'Name is required'),
    phone: z.string().min(1, 'Phone is required'),
    address: z.string().optional(),
    postalCode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
  deliveryFee: z.number().int().min(0), // cents
  deliveryType: z.enum(['delivery', 'self_pickup']).default('delivery'),
  fulfillmentType: z.enum(['asap', 'scheduled']).default('asap'),
  scheduledFor: z.string().datetime().optional(),
}).superRefine((data, ctx) => {
  if (data.deliveryType === 'delivery') {
    const addr = data.deliveryAddress;
    if (!addr.address?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'address'], message: 'Address is required for delivery' });
    }
    if (!addr.postalCode?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'postalCode'], message: 'Postal code is required for delivery' });
    }
    if (!addr.city?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'city'], message: 'City is required for delivery' });
    }
    if (!addr.state?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'state'], message: 'State is required for delivery' });
    }
  }
})

interface CheckoutSessionResponse {
  success: true
  checkoutUrl: string
  sessionId: string
}

interface CheckoutError {
  success: false
  error: string
  code?: string
}

type CheckoutResult = CheckoutSessionResponse | CheckoutError

const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover' as const,
})

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

export async function POST(req: NextRequest): Promise<NextResponse<CheckoutResult>> {
  try {
    // Use anon client only for auth verification
    const authClient = await getServerClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      console.warn('[API] Checkout unauthorized: No user found')
      return NextResponse.json(
        { success: false, error: 'Please sign in to checkout', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // Use service client for all DB operations (bypasses RLS for trusted server-side work)
    const supabase = getServiceClient()

    let body
    try {
      body = await req.json()
    } catch (e) {
      console.error('[API] Failed to parse request JSON:', e)
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const parsed = CheckoutRequestSchema.safeParse(body)

    if (!parsed.success) {
      console.error('[API] Validation failed:', parsed.error.format())
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid request: ' + parsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join(', '), 
          code: 'INVALID_REQUEST' 
        },
        { status: 400 }
      )
    }

    const { items, deliveryAddress, deliveryFee, deliveryType, fulfillmentType, scheduledFor } = parsed.data

    // Self-pickup cannot have delivery fee
    const effectiveDeliveryFee = deliveryType === 'self_pickup' ? 0 : deliveryFee

    // Fetch store settings for scheduling validation
    const { data: storeSettings } = await supabase
      .from('store_settings')
      .select('kitchen_lead_minutes, pickup_enabled, operating_hours')
      .limit(1)
      .single()

    const kitchenLeadMinutes = storeSettings?.kitchen_lead_minutes ?? 20

    // Validate self-pickup availability
    if (deliveryType === 'self_pickup' && !storeSettings?.pickup_enabled) {
      return NextResponse.json(
        { success: false, error: 'Self-pickup is not currently available', code: 'PICKUP_DISABLED' },
        { status: 400 }
      )
    }

    // Validate scheduled orders
    let dispatchAfter: string | null = null
    if (fulfillmentType === 'scheduled') {
      if (!scheduledFor) {
        return NextResponse.json(
          { success: false, error: 'Scheduled orders require a pickup/delivery time', code: 'MISSING_SCHEDULE' },
          { status: 400 }
        )
      }

      const scheduledDate = new Date(scheduledFor)
      const now = new Date()
      const minLead = new Date(now.getTime() + kitchenLeadMinutes * 60 * 1000)
      const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      if (scheduledDate < minLead) {
        return NextResponse.json(
          { success: false, error: `Minimum ${kitchenLeadMinutes} minutes lead time required`, code: 'INSUFFICIENT_LEAD_TIME' },
          { status: 400 }
        )
      }

      if (scheduledDate > maxDate) {
        return NextResponse.json(
          { success: false, error: 'Cannot schedule more than 7 days ahead', code: 'TOO_FAR_AHEAD' },
          { status: 400 }
        )
      }

      // Check operating hours
      if (storeSettings?.operating_hours) {
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
        const dayOfWeek = dayNames[scheduledDate.getDay()]
        const dayHours = storeSettings.operating_hours[dayOfWeek]

        if (dayHours) {
          const [openH, openM] = dayHours.open.split(':').map(Number)
          const [closeH, closeM] = dayHours.close.split(':').map(Number)
          const scheduledH = scheduledDate.getHours()
          const scheduledM = scheduledDate.getMinutes()
          const scheduledMinutes = scheduledH * 60 + scheduledM
          const openMinutes = openH * 60 + openM
          const closeMinutes = closeH * 60 + closeM

          if (scheduledMinutes < openMinutes || scheduledMinutes >= closeMinutes) {
            return NextResponse.json(
              { success: false, error: 'Selected time is outside operating hours', code: 'OUTSIDE_HOURS' },
              { status: 400 }
            )
          }
        }
      }

      // Calculate dispatch time (scheduled time minus kitchen lead time)
      dispatchAfter = new Date(scheduledDate.getTime() - kitchenLeadMinutes * 60 * 1000).toISOString()
    }

    // Resolve customer ID from auth user
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
          name: user.user_metadata?.full_name || deliveryAddress.fullName,
          phone: deliveryAddress.phone,
        })
        .select('id')
        .single()

      if (customerError || !newCustomer) {
        console.error('[API] Failed to create customer:', customerError)
        return NextResponse.json(
          { success: false, error: 'Unable to create customer profile', code: 'CUSTOMER_FAILED' },
          { status: 500 }
        )
      }
      customerId = newCustomer.id
    }

    // Validate all prices from database (never trust client)
    const menuItemIds = items.map(i => i.id)
    const { data: dbItems, error: dbError } = await supabase
      .from('menu_items')
      .select('id, name, price_cents, image_url')
      .in('id', menuItemIds)

    if (dbError || !dbItems) {
      console.error('[API] Failed to fetch menu items:', dbError)
      return NextResponse.json(
        { success: false, error: 'Unable to validate prices', code: 'PRICE_VALIDATION_FAILED' },
        { status: 500 }
      )
    }

    // Calculate subtotal from DB prices (server-truth)
    let subtotalCents = 0
    const validatedItems = items.map(item => {
      const dbItem = dbItems.find(d => d.id === item.id)
      if (!dbItem) {
        throw new Error(`Menu item not found: ${item.id}`)
      }
      const lineTotal = dbItem.price_cents * item.quantity
      subtotalCents += lineTotal
      return { ...item, dbPriceCents: dbItem.price_cents, lineTotalCents: lineTotal, dbName: dbItem.name, dbImageUrl: dbItem.image_url }
    })

    const totalCents = subtotalCents + effectiveDeliveryFee

    // Create order
    const orderNumber = generateOrderNumber()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        customer_name: deliveryAddress.fullName,
        customer_phone: deliveryAddress.phone,
        status: 'pending',
        subtotal_cents: subtotalCents,
        delivery_fee_cents: effectiveDeliveryFee,
        total_cents: totalCents,
        delivery_address_json: deliveryType === 'delivery' ? deliveryAddress : null,
        delivery_type: deliveryType,
        fulfillment_type: fulfillmentType,
        scheduled_for: scheduledFor || null,
        dispatch_after: dispatchAfter,
        dispatch_status: fulfillmentType === 'scheduled' ? 'queued' : 'not_ready',
        kitchen_lead_minutes: kitchenLeadMinutes,
        stripe_session_id: null,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('[API] Failed to create order:', orderError)
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
      console.error('[API] Failed to insert order items:', itemsError)
      // Clean up the order
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
      const { error: modError } = await supabase
        .from('order_item_modifiers')
        .insert(orderItemModifiers)

      if (modError) {
        console.error('[API] Failed to insert order item modifiers:', modError)
        // Non-fatal: order and items exist, modifiers are supplementary
      }
    }

    // Create Stripe Checkout Session
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = validatedItems.map((item) => ({
      price_data: {
        currency: 'myr',
        product_data: {
          name: item.dbName,
          images: item.image ? [item.image] : undefined,
          metadata: {
            menu_item_id: item.id,
          },
        },
        unit_amount: item.dbPriceCents,
      },
      quantity: item.quantity,
    }))

    if (effectiveDeliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'myr',
          product_data: {
            name: 'Delivery Fee',
          },
          unit_amount: effectiveDeliveryFee,
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${env.NEXT_PUBLIC_URL}/order/success?orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.NEXT_PUBLIC_URL}/checkout`,
      metadata: {
        order_id: order.id,
        customer_id: customerId,
        customer_email: user.email || '',
      },
      customer_email: user.email || undefined,
      shipping_address_collection: deliveryType === 'delivery'
        ? { allowed_countries: ['MY'] }
        : undefined,
      billing_address_collection: 'required',
    })

    if (!session.url) {
      console.error('[API] Stripe session created but no URL')
      return NextResponse.json(
        { success: false, error: 'Unable to create checkout session', code: 'SESSION_FAILED' },
        { status: 500 }
      )
    }

    // Update order with Stripe session ID
    await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id)

    return NextResponse.json(
      {
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/checkout/create:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        success: false,
        error: errorMessage.includes('authentication')
          ? 'Payment service unavailable. Please try again later.'
          : 'Unable to process checkout. Please try again.',
        code: 'CHECKOUT_FAILED',
      },
      { status: 500 }
    )
  }
}
