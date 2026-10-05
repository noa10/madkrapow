import Stripe from 'stripe'
import { env } from '@/lib/validators/env'
import { STRIPE_API_VERSION } from '@/lib/stripe/api-version'

export class StripeClient {
  private readonly stripe: Stripe
  private readonly webhookSecret: string

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: STRIPE_API_VERSION,
    })
    this.webhookSecret = env.STRIPE_WEBHOOK_SECRET!
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
      // API 2026-09-30.endive removed `payment_method_types` from session create
      // params. `allowed_payment_method_types` is the replacement and acts as a
      // filter on the dashboard-configured set, so it can only ever narrow the
      // offered methods — never widen them beyond what the account enables.
      allowed_payment_method_types: ['fpx', 'grabpay', 'card'],
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
      ...(customerEmail ? { customer_email: customerEmail } : {}),
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
