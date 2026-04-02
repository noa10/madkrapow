/**
 * Normalize a Malaysian phone number to E.164 format.
 *
 * Handles common Malaysian formats:
 * - "0123456789"       → "+60123456789"
 * - "012-345 6789"     → "+60123456789"
 * - "60123456789"      → "+60123456789"
 * - "+60123456789"     → "+60123456789" (passthrough)
 * - "  +60 12-345 6789" → "+60123456789"
 *
 * Returns null if the input cannot be normalized to a valid Malaysian number.
 */
export function normalizeMalaysianPhone(raw: string): string | null {
  if (!raw) return null

  // Strip all non-digit characters except leading +
  const stripped = raw.replace(/[^\d+]/g, '')

  // Already E.164 with +60
  if (/^\+60\d{8,11}$/.test(stripped)) {
    return stripped
  }

  // Has 60 prefix but no +
  if (/^60\d{8,11}$/.test(stripped)) {
    return `+${stripped}`
  }

  // Local format starting with 0
  if (/^0\d{8,10}$/.test(stripped)) {
    return `+60${stripped.slice(1)}`
  }

  return null
}

/**
 * Validate whether a string is a valid E.164 Malaysian phone number.
 */
export function isValidMalaysianPhone(phone: string): boolean {
  return /^\+60\d{8,11}$/.test(phone)
}
