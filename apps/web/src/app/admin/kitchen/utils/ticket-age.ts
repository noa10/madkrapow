/**
 * How stale an active kitchen ticket is, and how to say how long it has been
 * waiting.
 *
 * Deliberately mirrors the merchant app's `ticket-age` ladder (Flutter,
 * `kitchen_order_card.dart`) word for word — the two kitchen displays are meant
 * to read identically, and date-fns would render "12 minutes ago" where the app
 * says "12 min ago".
 */

export type TicketAge = 'fresh' | 'aging' | 'overdue'

/** Minutes on the pass before a ticket is called aging, then overdue. */
export const AGING_AFTER_MINUTES = 15
export const OVERDUE_AFTER_MINUTES = 25

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Buckets a ticket by how long it has been on the pass at `now`.
 *
 * A future-dated `createdAt` (clock skew, or a scheduled order) falls into
 * `fresh`, matching the app's behaviour.
 */
export function ticketAge(createdAt: Date | string, now: Date): TicketAge {
  const minutes = Math.floor(
    (now.getTime() - toDate(createdAt).getTime()) / 60_000
  )
  if (minutes >= OVERDUE_AFTER_MINUTES) return 'overdue'
  if (minutes >= AGING_AFTER_MINUTES) return 'aging'
  return 'fresh'
}

/** Human-readable age, e.g. "Just now", "12 min ago", "3h ago", "2mo ago". */
export function formatElapsed(createdAt: Date | string, now: Date): string {
  const seconds = Math.floor(
    (now.getTime() - toDate(createdAt).getTime()) / 1000
  )
  if (seconds < 5) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  return `${Math.floor(days / 30)}mo ago`
}
