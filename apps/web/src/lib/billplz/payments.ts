import type { createServerClient } from '@supabase/ssr'
import type { BillplzBill } from '@/lib/billplz/client'

type ServiceClient = ReturnType<typeof createServerClient>

/**
 * Persist a successful Billplz payment in the canonical `payments` ledger.
 *
 * The callback and the success-page verification can both reach this point, and
 * Billplz may retry a callback, so the insert is deliberately idempotent: an
 * existing `external_ref` (the bill id) is treated as already recorded.
 *
 * `orders.billplz_bill_id` remains the fast path used by the provider badges;
 * this row carries the money facts for reporting/refunds.
 */
export async function recordBillplzPayment(
  supabase: ServiceClient,
  orderId: string,
  bill: BillplzBill,
  amountCents: number,
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from('payments')
    .select('id')
    .eq('external_ref', bill.id)
    .maybeSingle()

  if (lookupError) {
    console.error('[Billplz] Failed to look up existing payment:', lookupError.message)
    return
  }
  if (existing) return

  const { error: insertError } = await supabase.from('payments').insert({
    order_id: orderId,
    method: 'billplz',
    amount_cents: amountCents,
    currency: 'MYR',
    status: 'succeeded',
    external_ref: bill.id,
    paid_at: parseBillplzPaidAt(bill.paid_at),
    raw: bill,
  })

  if (insertError) {
    // A concurrent callback can win the unique index race; that is success.
    if (insertError.code !== '23505') {
      console.error('[Billplz] Failed to record payment:', insertError.message)
    }
  }
}

/**
 * Billplz sends `paid_at` as `YYYY-MM-DD HH:MM:SS TimeZone`. Fall back to the
 * current time if the value is missing or unparseable so the ledger never gets
 * an invalid timestamp.
 */
export function parseBillplzPaidAt(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return new Date().toISOString()
  }

  const normalized = value.trim().replace(' ', 'T').replace(/\s+([+-]\d{2}:?\d{2})$/, '$1')
  const parsed = new Date(normalized)

  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}
