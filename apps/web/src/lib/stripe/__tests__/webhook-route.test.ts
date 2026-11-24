import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'
import type { NextRequest } from 'next/server'

const { finalize, createServerClient, cancel } = vi.hoisted(() => ({
  finalize: vi.fn(),
  createServerClient: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock('@/lib/validators/env', () => ({
  env: { STRIPE_SECRET_KEY: 'sk_test_offline', STRIPE_WEBHOOK_SECRET: 'whsec_offline_test' },
}))
vi.mock('@/lib/services/order-payment', () => ({ finalizePaidOrder: finalize }))
vi.mock('@supabase/ssr', () => ({ createServerClient }))

import { POST } from '@/app/api/webhooks/stripe/route'

function signedRequest(version: string, type: string, paymentStatus: string, tamper = false): NextRequest {
  const payload = JSON.stringify({
    id: 'evt_offline', object: 'event', api_version: version, type,
    data: { object: {
      id: 'cs_offline', object: 'checkout.session',
      metadata: { order_id: 'order_offline' },
      payment_intent: 'pi_offline', payment_status: paymentStatus,
    } },
  })
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_offline_test' })
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST', headers: { 'stripe-signature': signature }, body: tamper ? `${payload} ` : payload,
  }) as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_offline_test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'offline_service_role')
  finalize.mockResolvedValue({ outcome: 'advanced' })
  cancel.mockResolvedValue({ error: null })
  createServerClient.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'pending' }, error: null }) }) }),
      update: () => ({ eq: cancel }),
    }),
  })
})

describe('Stripe webhook with signed offline events', () => {
  it.each(['2026-09-30.endive', '2026-10-28.endive'])(
    'processes a paid checkout event rendered at %s', async (version) => {
      const response = await POST(signedRequest(version, 'checkout.session.completed', 'paid'))
      expect(response.status).toBe(200)
      expect(finalize).toHaveBeenCalledWith(expect.anything(), 'order_offline', {
        paymentPatch: { stripe_payment_intent_id: 'pi_offline' }, logLabel: 'Webhook',
      })
    },
  )

  it('defers an unpaid checkout until asynchronous payment succeeds', async () => {
    const pending = await POST(signedRequest('2026-09-30.endive', 'checkout.session.completed', 'unpaid'))
    expect(pending.status).toBe(200)
    expect(finalize).not.toHaveBeenCalled()

    const paid = await POST(signedRequest('2026-09-30.endive', 'checkout.session.async_payment_succeeded', 'paid'))
    expect(paid.status).toBe(200)
    expect(finalize).toHaveBeenCalledOnce()
  })

  it('cancels an order on asynchronous payment failure', async () => {
    const response = await POST(signedRequest('2026-09-30.endive', 'checkout.session.async_payment_failed', 'unpaid'))
    expect(response.status).toBe(200)
    expect(cancel).toHaveBeenCalledWith('id', 'order_offline')
    expect(finalize).not.toHaveBeenCalled()
  })

  it('rejects an altered payload before accessing the database', async () => {
    const response = await POST(signedRequest('2026-09-30.endive', 'checkout.session.completed', 'paid', true))
    expect(response.status).toBe(400)
    expect(createServerClient).not.toHaveBeenCalled()
    expect(finalize).not.toHaveBeenCalled()
  })
})
