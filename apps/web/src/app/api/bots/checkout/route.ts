import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '@/lib/validators/env'
import { createServerClient } from '@supabase/ssr'
import { findOrCreateBotCustomer } from '@/lib/bots/customer'
import { clearSession } from '@/lib/bots/conversation'
import { getFreshBotSettings, getOperatingHoursForBot, isBotEnabled } from '@/lib/bots/settings'
import { isWithinDeliveryZone, geocodeAddress, type ParsedAddress } from '@/lib/bots/address'

const BotCheckoutItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().min(1).int(),
  modifiers: z.array(
    z.object({
      modifierId: z.string().min(1),
    })
  ).default([]),
})

const BotDeliveryAddressSchema = z.object({
  address_line1: z.string().min(1),
  address_line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

const BotCheckoutRequestSchema = z.object({
  platform: z.enum(['telegram', 'whatsapp']),
  platformUserId: z.string().min(1),
  items: z.array(BotCheckoutItemSchema).min(1),
  deliveryAddress: BotDeliveryAddressSchema,
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  deliveryType: z.enum(['delivery', 'self_pickup']).default('delivery'),
  sessionId: z.string().uuid(),
})

interface BotCheckoutSuccess {
  success: true
  checkoutUrl: string
  orderId: string
  orderNumber: string
}

interface BotCheckoutError {
  success: false
  error: string
  code?: string
}

type BotCheckoutResult = BotCheckoutSuccess | BotCheckoutError

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[BotCheckout] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })
}

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

export async function POST(req: NextRequest): Promise<NextResponse<BotCheckoutResult>> {
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia' as const,
    })

    let body
    try {
      body = await req.json()
    } catch (e) {
      console.error('[BotCheckout] Failed to parse request JSON:', e)
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    const parsed = BotCheckoutRequestSchema.safeParse(body)
    if (!parsed.success) {
      console.error('[BotCheckout] Validation failed:', parsed.error.format())
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: ' + parsed.error.issues.map(i => i.path.join('.') + ' ' + i.message).join(', '),
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      )
    }

    const {
      platform,
      platformUserId,
      items,
      deliveryAddress,
      contactName,
      contactPhone,
      deliveryType,
      sessionId,
    } = parsed.data

    const supabase = getServiceClient()

    // ── Bot settings & operating hours check ───────────────────────
    const botSettings = await getFreshBotSettings()

    if (!isBotEnabled(botSettings, platform)) {
      return NextResponse.json(
        {
          success: false,
          error: `Ordering via ${platform} is currently disabled.`,
          code: 'BOT_DISABLED',
        },
        { status: 400 }
      )
    }

    const hours = getOperatingHoursForBot(botSettings)
    if (!hours.isOpen) {
      return NextResponse.json(
        {
          success: false,
          error: hours.open && hours.close
            ? `We are currently closed. Our hours today are ${hours.open} - ${hours.close}.`
            : 'We are currently closed. Please check our operating hours.',
          code: 'STORE_CLOSED',
        },
        { status: 400 }
      )
    }

    // ── Address validation for delivery orders ─────────────────────
    if (deliveryType === 'delivery') {
      let lat = deliveryAddress.latitude
      let lng = deliveryAddress.longitude

      // If coordinates not provided, try to geocode
      if (lat === undefined || lng === undefined) {
        try {
          const parsedAddr: ParsedAddress = {
            address_line1: deliveryAddress.address_line1,
            address_line2: deliveryAddress.address_line2,
            city: deliveryAddress.city,
            state: deliveryAddress.state,
            postal_code: deliveryAddress.postal_code,
            country: 'Malaysia',
          }
          const geocodeResult = await geocodeAddress(parsedAddr)
          if (geocodeResult) {
            lat = geocodeResult.latitude
            lng = geocodeResult.longitude
          }
        } catch (geoErr) {
          console.error('[BotCheckout] Geocoding failed:', geoErr)
          // Continue without coordinates; isWithinDeliveryZone returns true if no geofence
        }
      }

      if (lat !== undefined && lng !== undefined) {
        const inZone = await isWithinDeliveryZone(supabase, lat, lng)
        if (!inZone) {
          return NextResponse.json(
            { success: false, error: 'Delivery address is outside our delivery zone', code: 'OUTSIDE_ZONE' },
            { status: 400 }
          )
        }
      }
    }

    // ── Fetch store settings for delivery fee ──────────────────────
    const { data: storeSettings } = await supabase
      .from('store_settings')
      .select('delivery_fee, kitchen_lead_minutes, cutlery_enabled, cutlery_default')
      .limit(1)
      .single()

    const deliveryFeeCents = deliveryType === 'self_pickup'
      ? 0
      : (storeSettings?.delivery_fee ?? 0)

    const kitchenLeadMinutes = storeSettings?.kitchen_lead_minutes ?? 20
    const includeCutlery = storeSettings?.cutlery_enabled
      ? (storeSettings?.cutlery_default ?? true)
      : false

    // ── Validate all prices from database (never trust client) ─────
    const menuItemIds = items.map(i => i.menuItemId)
    const modifierIds = items.flatMap(i => i.modifiers.map(m => m.modifierId))

    const [menuResult, modifiersResult] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, name, price_cents, image_url, is_available')
        .in('id', menuItemIds),
      modifierIds.length > 0
        ? supabase
            .from('modifiers')
            .select('id, name, price_delta_cents, is_available')
            .in('id', modifierIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    const { data: dbItems, error: dbError } = menuResult
    const { data: dbModifiers } = modifiersResult

    if (dbError || !dbItems) {
      console.error('[BotCheckout] Failed to fetch menu items:', dbError)
      return NextResponse.json(
        { success: false, error: 'Unable to validate prices', code: 'PRICE_VALIDATION_FAILED' },
        { status: 500 }
      )
    }

    // Reject unavailable items
    const unavailableItems = dbItems.filter(d => !d.is_available)
    if (unavailableItems.length > 0) {
      return NextResponse.json(
        { success: false, error: `${unavailableItems[0].name} is no longer available`, code: 'ITEM_UNAVAILABLE' },
        { status: 400 }
      )
    }

    const unavailableModifiers = (dbModifiers ?? []).filter(d => !d.is_available)
    if (unavailableModifiers.length > 0) {
      return NextResponse.json(
        { success: false, error: `${unavailableModifiers[0].name} is no longer available`, code: 'MODIFIER_UNAVAILABLE' },
        { status: 400 }
      )
    }

    // Calculate subtotal from DB prices
    let subtotalCents = 0
    const validatedItems = items.map(item => {
      const dbItem = dbItems.find(d => d.id === item.menuItemId)
      if (!dbItem) {
        throw new Error(`Menu item not found: ${item.menuItemId}`)
      }

      let modifierTotalCents = 0
      const validatedModifiers = item.modifiers.map(mod => {
        const dbMod = dbModifiers?.find(d => d.id === mod.modifierId)
        if (!dbMod) {
          throw new Error(`Modifier not found: ${mod.modifierId}`)
        }
        modifierTotalCents += dbMod.price_delta_cents
        return { id: dbMod.id, name: dbMod.name, price_delta_cents: dbMod.price_delta_cents }
      })

      const unitPriceCents = dbItem.price_cents + modifierTotalCents
      const lineTotal = unitPriceCents * item.quantity
      subtotalCents += lineTotal

      return {
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        dbPriceCents: dbItem.price_cents,
        modifierTotalCents,
        unitPriceCents,
        lineTotalCents: lineTotal,
        dbName: dbItem.name,
        dbImageUrl: dbItem.image_url,
        validatedModifiers,
      }
    })

    const totalCents = subtotalCents + deliveryFeeCents

    // ── Find or create bot customer ────────────────────────────────
    const customer = await findOrCreateBotCustomer(platform, platformUserId, {
      name: contactName,
      phone: contactPhone,
    })

    // ── Validate session exists ────────────────────────────────────
    const { data: botSession } = await supabase
      .from('bot_sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle()

    if (!botSession) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session', code: 'INVALID_SESSION' },
        { status: 400 }
      )
    }

    // ── Generate order number ──────────────────────────────────────
    const orderNumber = generateOrderNumber()

    // ── Create order ───────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customer.id,
        customer_name: contactName,
        customer_phone: contactPhone,
        status: 'pending',
        subtotal_cents: subtotalCents,
        delivery_fee_cents: deliveryFeeCents,
        discount_cents: 0,
        total_cents: totalCents,
        promo_code_id: null,
        delivery_address_json: deliveryType === 'delivery' ? {
          address_line1: deliveryAddress.address_line1,
          address_line2: deliveryAddress.address_line2,
          city: deliveryAddress.city,
          state: deliveryAddress.state,
          postal_code: deliveryAddress.postal_code,
          latitude: deliveryAddress.latitude,
          longitude: deliveryAddress.longitude,
        } : null,
        order_kind: 'standard',
        delivery_type: deliveryType,
        fulfillment_type: 'asap',
        scheduled_for: null,
        dispatch_after: null,
        dispatch_status: 'not_ready',
        kitchen_lead_minutes: kitchenLeadMinutes,
        include_cutlery: includeCutlery,
        stripe_session_id: null,
        source: platform,
        bot_session_id: sessionId,
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('[BotCheckout] Failed to create order:', orderError)
      return NextResponse.json(
        { success: false, error: 'Unable to create order. Please try again.', code: 'ORDER_FAILED' },
        { status: 500 }
      )
    }

    // ── Insert order items ─────────────────────────────────────────
    const orderItems = validatedItems.map(item => ({
      order_id: order.id,
      menu_item_id: item.menuItemId,
      menu_item_name: item.dbName,
      menu_item_price_cents: item.dbPriceCents,
      quantity: item.quantity,
      line_total_cents: item.lineTotalCents,
      notes: item.validatedModifiers.length > 0 ? item.validatedModifiers.map(m => m.name).join(', ') : null,
      image_url: item.dbImageUrl || null,
    }))

    const { data: insertedItems, error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems)
      .select('id')

    if (itemsError || !insertedItems) {
      console.error('[BotCheckout] Failed to insert order items:', itemsError)
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json(
        { success: false, error: 'Unable to create order items', code: 'ITEMS_FAILED' },
        { status: 500 }
      )
    }

    // ── Insert order item modifiers ──────────────────────────────────
    const orderItemModifiers: Array<{
      order_item_id: string
      modifier_id: string
      modifier_name: string
      modifier_price_delta_cents: number
    }> = []

    validatedItems.forEach((item, itemIndex) => {
      for (const mod of item.validatedModifiers) {
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
        console.error('[BotCheckout] Failed to insert order item modifiers:', modError)
        // Non-fatal: order and items exist
      }
    }

    // ── Create Stripe Checkout Session ───────────────────────────────
    const lineItems: NonNullable<Parameters<typeof stripe.checkout.sessions.create>[0]>['line_items'] = validatedItems.map((item) => {
      const modifierSuffix = item.validatedModifiers.length > 0
        ? ` (${item.validatedModifiers.map(m => m.name).join(', ')})`
        : ''
      return {
        price_data: {
          currency: 'myr',
          product_data: {
            name: `${item.dbName}${modifierSuffix}`,
            metadata: {
              menu_item_id: item.menuItemId,
            },
          },
          unit_amount: item.unitPriceCents,
        },
        quantity: item.quantity,
      }
    })

    if (deliveryFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'myr',
          product_data: {
            name: 'Delivery Fee',
          },
          unit_amount: deliveryFeeCents,
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${env.NEXT_PUBLIC_URL}/order/success?orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}&source=bot`,
      cancel_url: `${env.NEXT_PUBLIC_URL}/checkout`,
      metadata: {
        order_id: order.id,
        customer_id: customer.id,
        platform,
      },
      shipping_address_collection: deliveryType === 'delivery'
        ? { allowed_countries: ['MY'] }
        : undefined,
      billing_address_collection: 'required',
    })

    if (!session.url) {
      console.error('[BotCheckout] Stripe session created but no URL')
      await supabase.from('orders').delete().eq('id', order.id)
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

    // ── Clear bot session ──────────────────────────────────────────
    try {
      await clearSession(sessionId)
    } catch (clearErr) {
      console.error('[BotCheckout] Failed to clear bot session:', clearErr)
      // Non-fatal: order is already created
    }

    return NextResponse.json(
      {
        success: true,
        checkoutUrl: session.url,
        orderId: order.id,
        orderNumber,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[BotCheckout] Error:', error)
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
