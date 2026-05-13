/**
 * Storage abstraction for daily order-display-code reservations.
 *
 * The atomic unit is `(dateString, code)`. A reservation is claimed by `reserve` —
 * implementations MUST return true only if they actually inserted the row (so two
 * parallel callers racing on the same candidate can never both see `true`).
 */
export interface OrderDisplayCodeStore {
  /** Returns true iff this code is already reserved for the given KL date. */
  isUsed(dateString: string, code: string): Promise<boolean>

  /**
   * Atomic reserve. Returns true if this call claimed the (date, code) pair,
   * false if it was already taken. Never throws on contention.
   */
  reserve(dateString: string, code: string): Promise<boolean>

  /**
   * Count codes reserved for a date. Used by the generator to short-circuit when
   * the current digit-length pool is already exhausted, so it doesn't waste
   * random attempts.
   */
  countUsed(dateString: string, digitLength: number): Promise<number>
}
