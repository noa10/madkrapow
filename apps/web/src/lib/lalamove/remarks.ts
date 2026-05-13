/**
 * Build the `recipients[].remarks` string for a Lalamove order.
 *
 * This is the only documented driver-visible free-text field in Lalamove v3 (metadata
 * is internal-only). We pack three identifiers so drivers can cross-reference with the
 * merchant/admin UI, then preserve any existing recipient notes on a second line.
 *
 * Format:
 *   Order MK-042 | ID: ec8ffffd | Ref: MKMP2ZUWCVLHPG
 *   <existing notes — e.g. "Leave at reception, floor 3">
 *
 * Anything over {@link MAX_REMARKS_LEN} chars is truncated with a trailing ellipsis so
 * Lalamove doesn't reject the request.
 */
export const MAX_REMARKS_LEN = 1500 // Lalamove v3 documented upper bound

export interface BuildLalamoveRemarksInput {
  /** Stable per-KL-day code (e.g. "MK-042"). Prefer `order.display_code`. */
  displayCode?: string | null
  /** Order UUID. Used for an 8-char system ID suffix if displayCode is missing. */
  orderId: string
  /** Original stored order number (e.g. "MKMP2ZUWCVLHPG"). */
  orderNumber?: string | null
  /** Any recipient notes we already have (from request body or order row). */
  existingNotes?: string | null
}

export function buildLalamoveRemarks(input: BuildLalamoveRemarksInput): string {
  const { displayCode, orderId, orderNumber, existingNotes } = input

  const parts: string[] = []
  if (displayCode) parts.push(`Order ${displayCode}`)
  parts.push(`ID: ${orderId.slice(0, 8)}`)
  if (orderNumber) parts.push(`Ref: ${orderNumber}`)

  const header = parts.join(' | ')
  const notes = (existingNotes ?? '').trim()
  const full = notes ? `${header}\n${notes}` : header

  if (full.length <= MAX_REMARKS_LEN) return full
  return full.slice(0, MAX_REMARKS_LEN - 1) + '…'
}
