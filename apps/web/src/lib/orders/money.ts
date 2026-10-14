/**
 * Money display helpers for admin order surfaces.
 *
 * Prices are stored as integer cents across the codebase (RM 12.50 => 1250).
 * These helpers centralise the display format so every surface renders the same
 * "RM 12.50" string and a partial/typed-cast Supabase payload can never leak
 * "RM NaN" into the UI.
 */

/**
 * Format integer cents as a Malaysian Ringgit string, e.g. `1250 => "RM 12.50"`.
 *
 * Non-finite or missing values (null / undefined / NaN / Infinity) fall back to
 * `"RM 0.00"` — orders carry nullable money columns and a cast-through-`any`
 * response can hand us `undefined`, so this guard is load-bearing.
 */
export function formatMoney(cents: number | null | undefined): string {
  const value = typeof cents === "number" && Number.isFinite(cents) ? cents : 0
  return `RM ${(value / 100).toFixed(2)}`
}
