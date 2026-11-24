import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordStripePayment } from '../payments'

interface ClientOptions {
  existing?: { id: string } | null
  lookupError?: { message: string } | null
  insertError?: { code?: string; message: string } | null
}

function buildClient(options: ClientOptions = {}) {
  const inserts: Array<Record<string, unknown>> = []
  const client = {
    inserts,
    from(table: string) {
      expect(table).toBe('payments')
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: options.existing ?? null,
              error: options.lookupError ?? null,
            }),
          }),
        }),
        insert: async (payload: Record<string, unknown>) => {
          inserts.push(payload)
          return { error: options.insertError ?? null }
        },
      }
    },
  }
  return client
}

const payment = { sessionId: 'cs_live_abc', amountTotal: 1250 }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordStripePayment', () => {
  it('records a succeeded MYR payment keyed by the Stripe session id', async () => {
    const client = buildClient()

    await recordStripePayment(client as never, 'order-1', payment)

    expect(client.inserts).toHaveLength(1)
    expect(client.inserts[0]).toMatchObject({
      order_id: 'order-1',
      method: 'stripe',
      amount_cents: 1250,
      currency: 'MYR',
      status: 'succeeded',
      external_ref: 'cs_live_abc',
    })
    expect(typeof client.inserts[0].paid_at).toBe('string')
  })

  it('does not insert a second row for a session already recorded', async () => {
    const client = buildClient({ existing: { id: 'payment-1' } })

    await recordStripePayment(client as never, 'order-1', payment)

    expect(client.inserts).toHaveLength(0)
  })

  it('treats a duplicate external_ref as already recorded', async () => {
    const client = buildClient({ insertError: { code: '23505', message: 'duplicate key value' } })

    await expect(recordStripePayment(client as never, 'order-1', payment)).resolves.toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does not throw when the lookup fails', async () => {
    const client = buildClient({ lookupError: { message: 'connection reset' } })

    await expect(recordStripePayment(client as never, 'order-1', payment)).resolves.toBeUndefined()
    expect(client.inserts).toHaveLength(0)
    expect(console.error).toHaveBeenCalled()
  })

  it('does not throw when the insert fails', async () => {
    const client = buildClient({ insertError: { message: 'permission denied' } })

    await expect(recordStripePayment(client as never, 'order-1', payment)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
