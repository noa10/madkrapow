/**
 * Pure time/urgency helpers for the admin order card.
 *
 * `now` is injected so results are deterministic in tests; use
 * `getOrderUrgencyNow` when a live clock is acceptable. Thresholds and formats
 * mirror the inline logic this replaces in `OrderRowCard`:
 * - elapsed chip: `<1m`, `5m`, `2h`, `3d`
 * - urgency tier: <5m fresh (emerald), <=15m warning (amber), >15m late (red)
 * - clock label: `h:mm a` today, `MMM d, yyyy, h:mm a` otherwise
 */

import { format, parseISO } from "date-fns"

export type UrgencyTier = "fresh" | "warning" | "late"

export interface OrderUrgency {
  /** Compact age chip, e.g. `<1m`, `5m`, `2h`, `3d`. Empty when invalid. */
  elapsedLabel: string
  /** Whole elapsed minutes (floor, clamped at 0). */
  minutes: number
  tier: UrgencyTier
  /** `h:mm a` for today, `MMM d, yyyy, h:mm a` for other days. Empty when invalid. */
  timestampLabel: string
  isToday: boolean
  /** False when `createdAt` was not a parseable date. */
  valid: boolean
}

function invalidUrgency(): OrderUrgency {
  return {
    elapsedLabel: "",
    minutes: 0,
    tier: "fresh",
    timestampLabel: "",
    isToday: false,
    valid: false,
  }
}

function elapsedLabelFor(minutes: number): string {
  if (minutes < 1) return "<1m"
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

function urgencyTierFor(minutes: number): UrgencyTier {
  if (minutes < 5) return "fresh"
  if (minutes <= 15) return "warning"
  return "late"
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function getOrderUrgency(createdAt: string, now: Date): OrderUrgency {
  try {
    const d = parseISO(createdAt)
    if (Number.isNaN(d.getTime())) return invalidUrgency()

    const diffMs = now.getTime() - d.getTime()
    const minutes = Math.max(0, Math.floor(diffMs / 60000))
    const isToday = isSameDay(d, now)
    const timestampLabel = isToday
      ? format(d, "h:mm a")
      : format(d, "MMM d, yyyy, h:mm a")

    return {
      elapsedLabel: elapsedLabelFor(minutes),
      minutes,
      tier: urgencyTierFor(minutes),
      timestampLabel,
      isToday,
      valid: true,
    }
  } catch {
    return invalidUrgency()
  }
}

/** Thin default that reads the current clock. Prefer `getOrderUrgency` in tests. */
export function getOrderUrgencyNow(createdAt: string): OrderUrgency {
  return getOrderUrgency(createdAt, new Date())
}
