/**
 * Payment methods offered by the web checkout.
 *
 * Keep this list client-safe: the checkout page imports it directly, so it must
 * not pull in server-only modules (env validation, crypto, Supabase).
 */
export const PAYMENT_METHOD_IDS = ['stripe', 'billplz'] as const

export type PaymentMethod = (typeof PAYMENT_METHOD_IDS)[number]

export interface PaymentMethodOption {
  id: PaymentMethod
  label: string
  description: string
}

export const PAYMENT_METHOD_OPTIONS: readonly PaymentMethodOption[] = [
  {
    id: 'stripe',
    label: 'Card (Stripe)',
    description: 'Pay with a credit or debit card. You will be redirected to Stripe.',
  },
  {
    id: 'billplz',
    label: 'FPX Online Banking (Billplz)',
    description: 'Pay from Maybank2u, CIMB Clicks, and other Malaysian banks via FPX.',
  },
]

export function getPaymentMethodOption(
  id: PaymentMethod,
): PaymentMethodOption {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.id === id) ?? PAYMENT_METHOD_OPTIONS[0]
}
