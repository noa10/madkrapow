/**
 * Shared log sanitiser (CWE-117, log injection).
 *
 * Values that reach a logger are often caller-controlled — a webhook payload's
 * item name, a request target, a job id. If such a value contains a line break
 * it can forge extra log lines, which makes logs misleading during an incident
 * and can be used to frame another actor or hide activity.
 *
 * This module is the single implementation used by every route that logs an
 * untrusted value. It previously existed as four byte-identical private copies
 * and one sink with no sanitiser at all (CodeQL alert #57); keeping one copy
 * means a new call site cannot silently miss the protection.
 */

/** Default cap: long enough for a PostgREST error, short enough to not flood. */
export const SANITIZE_FOR_LOG_MAX_LENGTH = 500

/**
 * Reduce an arbitrary value to a single-line, bounded, control-free string
 * safe to interpolate into a log line.
 *
 * Line breaks are removed (not replaced) so behaviour matches the copies this
 * replaced; everything else that can move a terminal cursor or start a new
 * line is stripped as well.
 */
export function sanitizeForLog(value: unknown, maxLength = SANITIZE_FOR_LOG_MAX_LENGTH): string {
  if (value === undefined || value === null) return ''

  const str = typeof value === 'string' ? value : String(value)

  const stripped = str
    // Line breaks are the actual injection vector, and this first replace is
    // also the shape static analysis recognises as a sanitiser.
    .replace(/\n|\r/g, '')
    // ANSI escape sequences (ESC [ ... final-byte) before the generic control
    // sweep, so the printable remainder of the sequence goes too.
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    // Remaining C0/C1 controls plus Unicode line/paragraph separators
    // (U+2028/U+2029) and NEL (U+0085), which some renderers treat as breaks.
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '')

  if (maxLength > 0 && stripped.length > maxLength) {
    return `${stripped.slice(0, maxLength)}…`
  }
  return stripped
}
