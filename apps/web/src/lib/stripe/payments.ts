import type { createServerClient } from '@supabase/ssr'

type ServiceClient = ReturnType<typeof createServerClient>

/**
 * Persist a successful Stripe payment in the canonical `payments` ledger.
 *
 * The webhook and the success-page verifier can both reach finalisation, and
 * Stripe retries a webhook for days, so the insert is idempotent: the session id
 * is the `external_ref`, and a duplicate is treated as already recorded.
 *
 * Without this row an order paid by card has no money record — the printed
 * receipt derives its payment method from the ledger, so it would print blank.
 */
export async function recordStripePayment(
  supabase: ServiceClient,
  orderId: string,
  payment: { sessionId: string; amountTotal: number },
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('payments')
    .select('id')
    .eq('external_ref', payment.sessionId)
    .maybeSingle()

  if (lookupError) {
    console.error('[Stripe] Failed to look up existing payment:', lookupError.message)
    return
  }
  if (existing) return

  const { error: insertError } = await supabase.from('payments').insert({
    order_id: orderId,
    method: 'stripe',
    amount_cents: payment.amountTotal,
    currency: 'MYR',
    status: 'succeeded',
    external_ref: payment.sessionId,
    paid_at: new Date().toISOString(),
    raw: {
      provider: 'stripe',
      session_id: payment.sessionId,
      amount_total: payment.amountTotal,
      currency: 'myr',
    },
  })

  if (insertError) {
    // A concurrent finaliser can win the unique index race; that is success.
    if (insertError.code !== '23505') {
      console.error('[Stripe] Failed to record payment:', insertError.message)
    }
  }
}
