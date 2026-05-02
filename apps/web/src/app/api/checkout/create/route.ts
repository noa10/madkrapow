import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '@/lib/validators/env'
import { getAuthenticatedUser } from '@/lib/supabase/server'

const CheckoutItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().positive().int(),
  image: z.string().optional(),
  modifiers: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    price_delta_cents: z.number().int(),
  })).default([]),
})

const PromoCodeEntrySchema = z.object({
  code: z.string().min(1),
  scope: z.enum(['order', 'delivery']),
})

const CheckoutRequestSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  deliveryAddress: z.object({
    fullName: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    address_line1: z.string().optional(),
    address_line2: z.string().optional(),
    postalCode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }),
  deliveryFee: z.number().int().min(0), // cents
  deliveryType: z.enum(['delivery', 'self_pickup']).default('delivery'),
  fulfillmentType: z.enum(['asap', 'scheduled']).default('asap'),
  scheduledFor: z.string().datetime().optional(),
  // v3 shipping fields (optional for backward compatibility)
  quotationId: z.string().optional(),
  serviceType: z.string().optional(),
  stopIds: z.object({
    pickup: z.string(),
    dropoff: z.string(),
  }).optional(),
  priceBreakdown: z.object({
    base: z.string(),
    total: z.string(),
    currency: z.string(),
    extraMileage: z.string().optional(),
    surcharge: z.string().optional(),
  }).optional(),
  // Promo codes — array of { code, scope } for stacking
  promoCodes: z.array(PromoCodeEntrySchema).default([]),
}).superRefine((data, ctx) => {
  if (data.deliveryType === 'delivery') {
    const addr = data.deliveryAddress;
    if (!addr.fullName?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'fullName'], message: 'Name is required for delivery' });
    }
    if (!addr.phone?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deliveryAddress', 'phone'], message: 'Phone is required for delivery' });
    }
    if (!addr.address?.trim() && !addr.address_line1?.trim()) {
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
  apiVersion: '2026-04-22.dahlia' as const,
})

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

export async function POST(req: NextRequest): Promise<NextResponse<CheckoutResult>> {
  try {
    // Use dual auth (cookie for web, Bearer token for mobile)
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !supabase) {
      console.warn('[API] Checkout unauthorized: No user found')
      return NextResponse.json(
        { success: false, error: 'Please sign in to checkout', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

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

    const { items, deliveryAddress, deliveryFee, deliveryType, fulfillmentType, scheduledFor, quotationId, serviceType, stopIds, priceBreakdown, promoCodes } = parsed.data

    // Self-pickup cannot have delivery fee
    const effectiveDeliveryFee = deliveryType === 'self_pickup' ? 0 : deliveryFee

    // ── Validate all prices from database (never trust client) ─────
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

    // ── Fetch store settings for scheduling validation ─────────────
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
          name: user.user_metadata?.full_name || deliveryAddress.fullName || '',
          phone: deliveryAddress.phone || '',
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

    // ── Promo validation and discount calculation ──────────────────
    let totalDiscountCents = 0
    let orderPromoCodeId: string | null = null

    if (promoCodes.length > 0) {
      const now = new Date().toISOString()
      const byScope = new Map<string, (typeof promoCodes)[number]>()
      for (const entry of promoCodes) {
        if (!byScope.has(entry.scope)) byScope.set(entry.scope, entry)
      }

      for (const entry of byScope.values()) {
        const { data: promo, error: promoError } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', entry.code.toLowerCase())
          .eq('scope', entry.scope)
          .eq('is_active', true)
          .gte('valid_until', now)
          .lte('valid_from', now)
          .maybeSingle()

        if (promoError || !promo) continue
        if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) continue

        const base = promo.scope === 'delivery' ? effectiveDeliveryFee : subtotalCents
        if (promo.min_order_amount_cents && base < promo.min_order_amount_cents) continue

        let discountCents = promo.discount_type === 'percentage'
          ? Math.round(base * (promo.discount_value / 100))
          : promo.discount_value

        const maxCap = promo.max_discount_cents ?? base
        discountCents = Math.min(discountCents, maxCap, base)

        totalDiscountCents += discountCents
        if (promo.scope === 'order' && !orderPromoCodeId) {
          orderPromoCodeId = promo.id
        }
      }
    }

    // Clamp: discount cannot exceed cart total
    totalDiscountCents = Math.min(totalDiscountCents, subtotalCents + effectiveDeliveryFee)

    const totalCents = subtotalCents + effectiveDeliveryFee - totalDiscountCents

    // Generate order number first (needed for Stripe coupon metadata)
    const orderNumber = generateOrderNumber()

    // ── Create Stripe Coupons for order-scoped promos ──────────────
    const stripeCouponIds: string[] = []
    if (totalDiscountCents > 0 && orderPromoCodeId) {
      const coupon = await stripe.coupons.create({
        amount_off: totalDiscountCents,
        currency: 'myr',
        duration: 'once',
        max_redemptions: 1,
        metadata: {
          promo_code_id: orderPromoCodeId,
          order_number: orderNumber,
        },
      })
      stripeCouponIds.push(coupon.id)
    }

    // Create order

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        customer_name: deliveryAddress.fullName || user.user_metadata?.full_name || '',
        customer_phone: deliveryAddress.phone || '',
        status: 'pending',
        subtotal_cents: subtotalCents,
        delivery_fee_cents: effectiveDeliveryFee,
        discount_cents: totalDiscountCents,
        total_cents: totalCents,
        promo_code_id: orderPromoCodeId,
        delivery_address_json: deliveryType === 'delivery' ? {
          ...deliveryAddress,
          // Ensure lat/lng is preserved for v3 API
          latitude: deliveryAddress.latitude,
          longitude: deliveryAddress.longitude,
        } : null,
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

    // Record order_promo_applications and increment usage counters
    if (totalDiscountCents > 0 && promoCodes.length > 0) {
      const now = new Date().toISOString()
      const appliedPromos: Array<{
        order_id: string
        promo_id: string
        scope: string
        discount_cents: number
      }> = []

      const byScope = new Map<string, (typeof promoCodes)[number]>()
      for (const entry of promoCodes) {
        if (!byScope.has(entry.scope)) byScope.set(entry.scope, entry)
      }

      for (const entry of byScope.values()) {
        const { data: promo } = await supabase
          .from('promo_codes')
          .select('id, scope, discount_type, discount_value, max_discount_cents, min_order_amount_cents')
          .eq('code', entry.code.toLowerCase())
          .eq('scope', entry.scope)
          .eq('is_active', true)
          .gte('valid_until', now)
          .lte('valid_from', now)
          .maybeSingle()

        if (!promo) continue

        const base = promo.scope === 'delivery' ? effectiveDeliveryFee : subtotalCents
        if (promo.min_order_amount_cents && base < promo.min_order_amount_cents) continue

        let discountCents = promo.discount_type === 'percentage'
          ? Math.round(base * (promo.discount_value / 100))
          : promo.discount_value

        const maxCap = promo.max_discount_cents ?? base
        discountCents = Math.min(discountCents, maxCap, base)

        if (discountCents > 0) {
          appliedPromos.push({
            order_id: order.id,
            promo_id: promo.id,
            scope: promo.scope,
            discount_cents: discountCents,
          })
        }
      }

      if (appliedPromos.length > 0) {
        const { error: appError } = await supabase
          .from('order_promo_applications')
          .insert(appliedPromos)

        if (appError) {
          console.error('[API] Failed to record promo applications:', appError)
        }

        // Increment usage counters for each applied promo
        for (const ap of appliedPromos) {
          await supabase.rpc('increment_promo_code_usage', {
            p_promo_id: ap.promo_id,
          })
        }
      }
    }

    // Create shipment draft if quotation data is provided (delivery orders only)
    if (deliveryType === 'delivery' && quotationId && stopIds && priceBreakdown) {
      const fullAddress = deliveryAddress.address || [
        deliveryAddress.address_line1,
        deliveryAddress.address_line2,
        deliveryAddress.city,
        deliveryAddress.state,
        deliveryAddress.postalCode,
      ].filter(Boolean).join(', ')

      await supabase.from('lalamove_shipments').insert({
        order_id: order.id,
        quotation_id: quotationId,
        service_type: serviceType || env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE || 'MOTORCYCLE',
        dispatch_status: 'quoted',
        quoted_fee_cents: effectiveDeliveryFee,
        currency: priceBreakdown.currency || 'MYR',
        sender_json: {
          name: 'Mad Krapow Store',
          phone: env.STORE_PHONE,
          address: env.STORE_ADDRESS,
          latitude: env.STORE_LATITUDE,
          longitude: env.STORE_LONGITUDE,
        },
        recipient_json: {
          name: deliveryAddress.fullName,
          phone: deliveryAddress.phone,
          address: fullAddress,
          latitude: deliveryAddress.latitude || 0,
          longitude: deliveryAddress.longitude || 0,
          postal_code: deliveryAddress.postalCode || '',
        },
        stop_ids: stopIds,
        quote_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min validity
        schedule_at: scheduledFor || null,
      })
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
    const lineItems: NonNullable<Parameters<typeof stripe.checkout.sessions.create>[0]>['line_items'] = validatedItems.map((item) => ({
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
      discounts: stripeCouponIds.length > 0
        ? stripeCouponIds.map(id => ({ coupon: id }))
        : undefined,
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
