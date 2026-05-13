import type { OrderDisplayCodeStore } from './store'

/**
 * Returns today's calendar date in Asia/Kuala_Lumpur (UTC+8) as `YYYY-MM-DD`.
 * Uses `Intl.DateTimeFormat` so DST-style adjustments (none in MY) stay correct.
 */
export function getKualaLumpurDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

const BASE_DIGIT_LENGTH = 3
const MAX_DIGIT_LENGTH = 10

export interface GenerateOptions {
  /** Override the KL date (primarily for tests). */
  date?: Date
  /** Override the random source (primarily for tests). Must return [0, 1). */
  random?: () => number
  /** Called when the generator expands the digit length for the day. */
  onExpand?: (info: { dateString: string; oldLength: number; newLength: number }) => void
}

/**
 * Generate and reserve an order display code that is unique within the KL calendar day.
 *
 * Starts at 3 digits (`MK-NNN`). If the day's pool at the current length is full, expands
 * to `MK-NNNN`, then `MK-NNNNN`, and so on. Expansion is per-day only — the next KL day
 * resets to 3 digits.
 */
export async function generateOrderDisplayCode(
  store: OrderDisplayCodeStore,
  opts: GenerateOptions = {},
): Promise<string> {
  const dateString = getKualaLumpurDateString(opts.date)
  const random = opts.random ?? Math.random
  const onExpand =
    opts.onExpand ??
    ((info) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[order-display-code] expanding length ${info.oldLength} → ${info.newLength} for ${info.dateString}`,
      )
    })

  let digitLength = BASE_DIGIT_LENGTH

  while (digitLength <= MAX_DIGIT_LENGTH) {
    const poolSize = 10 ** digitLength
    const used = await store.countUsed(dateString, digitLength)

    if (used >= poolSize) {
      const next = digitLength + 1
      onExpand({ dateString, oldLength: digitLength, newLength: next })
      digitLength = next
      continue
    }

    // Cap probing attempts so a nearly-full pool still expands promptly instead of
    // spinning on collisions. The multiplier trades CPU for collision tolerance.
    const maxAttempts = Math.min(poolSize * 2, 2000)

    let claimed: string | null = null
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const n = Math.floor(random() * poolSize)
      const candidate = `MK-${n.toString().padStart(digitLength, '0')}`
      // eslint-disable-next-line no-await-in-loop
      if (await store.reserve(dateString, candidate)) {
        claimed = candidate
        break
      }
    }

    if (claimed) return claimed

    // Ran out of attempts without claiming one — pool is effectively full for this
    // length. Expand and try again.
    const next = digitLength + 1
    onExpand({ dateString, oldLength: digitLength, newLength: next })
    digitLength = next
  }

  throw new Error(
    `order display code length exceeded maximum (${MAX_DIGIT_LENGTH}) for ${dateString}`,
  )
}
