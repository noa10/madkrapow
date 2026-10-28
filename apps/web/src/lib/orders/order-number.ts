/**
 * Order number generator shared by the POS and table-QR routes.
 *
 * `order_number` is the unique human-facing reference (the customer-facing
 * short code is `display_code`, assigned by a database trigger). Time and
 * randomness are injectable so tests are deterministic.
 */
export function generateOrderNumber(
  now: number = Date.now(),
  random: () => number = Math.random
): string {
  const timestamp = now.toString(36).toUpperCase()
  const suffix = random()
    .toString(36)
    .slice(2)
    .padEnd(4, '0')
    .slice(0, 4)
    .toUpperCase()
  return `MK${timestamp}${suffix}`
}
