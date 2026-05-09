/**
 * Deterministic daily display code for orders.
 * Same order + same date = same code across all platforms.
 */

// FNV-1a 32-bit hash constants
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
