import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '@/lib/validators/env'
import { getServerClient } from '@/lib/supabase/server'

const CheckoutRequestSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      price: z.number().positive(),
      quantity: z.number().positive().int(),
      image: z.string().optional(),
    })
  ).min(1),
  deliveryAddress: z.object({
    fullName: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().min(1),
    postalCode: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
  }),
  deliveryFee: z.number().min(0),
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

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover' as const,
})

function formatCurrencyToStripe(amount: number): number {
  return Math.round(amount * 100)
}

export async function POST(req: NextRequest): Promise<NextResponse<CheckoutResult>> {
  try {
    const supabase = await getServerClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to checkout',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = CheckoutRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      )
    }

    const { items, deliveryAddress, deliveryFee } = parsed.data

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
      price_data: {
        currency: 'myr',
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : undefined,
          metadata: {
            menu_item_id: item.id,
          },
        },
        unit_amount: formatCurrencyToStripe(item.price),
      },
      quantity: item.quantity,
    }))

    if (deliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency: 'myr',
          product_data: {
            name: 'Delivery Fee',
          },
          unit_amount: formatCurrencyToStripe(deliveryFee),
        },
        quantity: 1,
      })
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        customer_id: user.id,
        status: 'pending',
        total_amount: items.reduce((sum, item) => sum + item.price * item.quantity, 0) + deliveryFee,
        delivery_fee: deliveryFee,
        delivery_address: deliveryAddress,
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('[API] Failed to create order:', orderError)
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to create order. Please try again.',
          code: 'ORDER_FAILED',
        },
        { status: 500 }
      )
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${env.NEXT_PUBLIC_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&order_id=${order.id}`,
      cancel_url: `${env.NEXT_PUBLIC_URL}/checkout/cancel`,
      metadata: {
        order_id: order.id,
        customer_id: user.id,
        customer_email: user.email || '',
      },
      customer_email: user.email || undefined,
      shipping_address_collection: {
        allowed_countries: ['MY'],
      },
      billing_address_collection: 'required',
    })

    if (!session.url) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unable to create checkout session',
          code: 'SESSION_FAILED',
        },
        { status: 500 }
      )
    }

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