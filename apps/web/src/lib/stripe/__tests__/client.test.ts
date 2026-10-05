import { describe, it, expect, vi, beforeEach } from 'vitest'
import { STRIPE_API_VERSION } from '../api-version'
import { StripeClient } from '../client'

const mockSessionsCreate = vi.fn()
const mockConstructEvent = vi.fn()
const stripeConstructor = vi.fn()

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(function (this: unknown, ...args: unknown[]) {
    stripeConstructor(...args)
    return {
      checkout: { sessions: { create: mockSessionsCreate } },
      webhooks: { constructEvent: mockConstructEvent },
    }
  }),
}))

vi.mock('@/lib/validators/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_123',
  },
}))

describe('StripeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionsCreate.mockResolvedValue({ id: 'cs_test_1' })
  })

  it('pins the shared API version when constructing the Stripe client', () => {
    new StripeClient()

    expect(stripeConstructor).toHaveBeenCalledWith('sk_test_123', {
      apiVersion: STRIPE_API_VERSION,
    })
  })

  it('uses allowed_payment_method_types, not the removed payment_method_types', async () => {
    const client = new StripeClient()

    await client.createCheckoutSession({
      amount: 12.5,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })

    const [sessionParams] = mockSessionsCreate.mock.calls[0]

    // API 2026-09-30.endive removed `payment_method_types` from SessionCreateParams.
    expect(sessionParams).not.toHaveProperty('payment_method_types')
    expect(sessionParams.allowed_payment_method_types).toEqual(['fpx', 'grabpay', 'card'])
  })

  it('defaults to MYR and converts the amount to integer cents', async () => {
    const client = new StripeClient()

    await client.createCheckoutSession({
      amount: 12.5,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })

    const [sessionParams] = mockSessionsCreate.mock.calls[0]

    expect(sessionParams.line_items[0].price_data.currency).toBe('myr')
    expect(sessionParams.line_items[0].price_data.unit_amount).toBe(1250)
    expect(Number.isInteger(sessionParams.line_items[0].price_data.unit_amount)).toBe(true)
  })

  it('includes customer_email only when one is provided', async () => {
    const client = new StripeClient()

    await client.createCheckoutSession({
      amount: 10,
      customerEmail: 'diner@example.com',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })

    expect(mockSessionsCreate.mock.calls[0][0].customer_email).toBe('diner@example.com')

    mockSessionsCreate.mockClear()

    await client.createCheckoutSession({
      amount: 10,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    })

    // Must be absent rather than an explicit undefined so Stripe does not
    // receive a null customer_email.
    expect(mockSessionsCreate.mock.calls[0][0]).not.toHaveProperty('customer_email')
  })

  it('verifies webhook signatures with the configured signing secret', () => {
    const client = new StripeClient()
    mockConstructEvent.mockReturnValue({ id: 'evt_1', type: 'checkout.session.completed' })

    const event = client.verifyWebhookSignature('raw-body', 'sig-header')

    expect(mockConstructEvent).toHaveBeenCalledWith('raw-body', 'sig-header', 'whsec_test_123')
    expect(event).toEqual({ id: 'evt_1', type: 'checkout.session.completed' })
  })
})
