/**
 * A small in-process sliding-window limiter for the anonymous table-QR
 * endpoints.
 *
 * The table QR token is public (it is printed on the table), so every
 * table-QR write endpoint is reachable by anyone who photographs the table.
 * The create endpoint already has a per-table cap backed by the database; the
 * claim endpoint had none, and every claim runs a SECURITY DEFINER function
 * that takes a row lock.
 *
 * Scope: best effort per Node process. A multi-instance deployment gets one
 * window per instance, which still caps a single flood from one phone or bot.
 * The database stays the authority — the RPC's membership checks and the
 * table-order rate-limit trigger are unchanged by this.
 *
 * Bounded memory: a flood of unique random tokens must not grow the map
 * without limit. Expired keys are swept at most once per window, and the key
 * count is capped — the least-recently-used key is evicted when the cap is
 * reached, so per-call work stays O(1) amortized.
 */

/** One limiter instance, keyed by whatever the caller wants to scope on. */
export interface SlidingWindowLimiter {
  /** True when the call is allowed; false when the window is full. */
  allow(key: string): boolean
}

const DEFAULT_MAX_KEYS = 10_000

export function createSlidingWindowLimiter(
  limit: number,
  windowMs: number,
  maxKeys: number = DEFAULT_MAX_KEYS
): SlidingWindowLimiter {
  /** key → timestamps of allowed calls inside the current window. */
  const hits = new Map<string, number[]>()
  let lastSweep = Date.now()

  const sweep = (now: number) => {
    const cutoff = now - windowMs
    for (const [key, timestamps] of hits) {
      const kept = timestamps.filter((timestamp) => timestamp > cutoff)
      if (kept.length === 0) hits.delete(key)
      else hits.set(key, kept)
    }
    lastSweep = now
  }

  return {
    allow(key: string): boolean {
      const now = Date.now()
      if (now - lastSweep >= windowMs) sweep(now)

      const cutoff = now - windowMs
      const recent = (hits.get(key) ?? []).filter(
        (timestamp) => timestamp > cutoff
      )
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }

      recent.push(now)
      // Re-insert so the Map's insertion order tracks recency for eviction.
      hits.delete(key)
      hits.set(key, recent)

      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value
        if (oldest !== undefined) hits.delete(oldest)
      }
      return true
    },
  }
}
