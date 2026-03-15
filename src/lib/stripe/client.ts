import Stripe from 'stripe'
import { env } from '@/lib/validators/env'

export class StripeClient {
  private readonly stripe: Stripe
  private readonly webhookSecret: string

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-02-25.clover' as const,
    })
    this.webhookSecret = env.STRIPE_WEBHOOK_SECRET
  }

  get instance(): Stripe {
    return this.stripe
  }

  async createCheckoutSession(params: {
    amount: number
    currency?: string
    customerEmail?: string
    successUrl: string
    cancelUrl: string
    metadata?: Record<string, string>
  }): Promise<Stripe.Checkout.Session> {
    const {
      amount,
      currency = 'myr',
      customerEmail,
      successUrl,
      cancelUrl,
      metadata = {},
    } = params

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['fpx', 'grabpay', 'card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: 'Mad Krapow Order',
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    }

    if (customerEmail) {
      sessionParams.customer_email = customerEmail
    }

    return this.stripe.checkout.sessions.create(sessionParams)
  }

  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    const webhookEvent = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret
    )
    return webhookEvent
  }
}

export function createStripeClient(): StripeClient {
  return new StripeClient()
}
