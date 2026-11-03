/**
 * Display code for orders.
 *
 *  - Production codes are generated server-side by the `reserve_order_display_code(date)`
 *    Postgres function and stored in `orders.display_code`. Format: `MK-NNN` (3-digit
 *    base), expanded automatically to `MK-NNNN`, `MK-NNNNN`, etc. when the per-day pool
 *    fills. Unique per KL calendar day (not globally).
 *
 *  - `getOrderDisplayCode(order)` shows the Grab short number for GrabFood orders and
 *    falls back to the stored code (then the legacy FNV-1a daily hash for rows that
 *    predate the migration). Internal ids are never replaced.
 *
 *  - `generateOrderDisplayCode(id, date?)` is kept for the fallback only. New code should
 *    prefer `getOrderDisplayCode`.
 */

// FNV-1a 32-bit hash constants (legacy fallback)
const FNV_PRIME = 0x01000193
const FNV_OFFSET_BASIS = 0x811c9dc5

function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

function getKualaLumpurDateString(date?: Date): string {
  const d = date || new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(d)
}

export function generateOrderDisplayCode(orderId: string, date?: Date): string {
  const dateStr = getKualaLumpurDateString(date)
  const hash = fnv1a(orderId + dateStr)
  const num = hash % 1000
  return `MK-${num.toString().padStart(3, '0')}`
}

export interface ChannelDisplayInput {
  source?: string | null
  channel_orders?: { channel: string; external_order_number: string | null }[] | null
}

export interface OrderDisplayInput extends ChannelDisplayInput {
  id: string
  display_code?: string | null
}

/** The Grab short number for a GrabFood order, trimmed; null when unavailable. */
export function getGrabShortNumber(order: ChannelDisplayInput): string | null {
  if (order.source !== 'grabfood') return null
  const shortNumber = order.channel_orders?.find(
    (channel) => channel.channel === 'grabfood'
  )?.external_order_number
  const trimmed = shortNumber?.trim()
  return trimmed || null
}

export function getOrderDisplayCode(order: OrderDisplayInput, date?: Date): string {
  const shortNumber = getGrabShortNumber(order)
  if (shortNumber) return shortNumber
  if (order.display_code) return order.display_code
  return generateOrderDisplayCode(order.id, date)
}
