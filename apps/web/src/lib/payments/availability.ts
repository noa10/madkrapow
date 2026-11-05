import { isBillplzAvailable } from '@/lib/billplz/client'
import { isStripeAvailable } from '@/lib/stripe/config'
import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethodOption,
} from '@/lib/payments/methods'

/**
 * Payment methods the checkout can offer right now.
 *
 * A method is listed only when it is enabled, fully configured, and pointed at
 * the environment matching its credentials. This is what keeps a test-mode
 * gateway from rendering a payment button that cannot take money.
 *
 * Server-only: the availability probes read gateway secrets.
 */
export function getAvailablePaymentMethods(): PaymentMethodOption[] {
  const availability: Record<string, boolean> = {
    stripe: isStripeAvailable(),
    billplz: isBillplzAvailable(),
  }

  return PAYMENT_METHOD_OPTIONS.filter(
    (method) => availability[method.id] === true,
  )
}
