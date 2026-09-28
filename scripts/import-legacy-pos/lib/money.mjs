// Money parsing for the legacy Aliments POS export.
// Export values are decimal RM strings ("18", "19.3", "-33.6", "-0", "").
// Parsed with string arithmetic — never via parseFloat multiplication, which
// introduces float error (0.1-based values are common in this export).

/**
 * Parse a legacy RM decimal string into integer sen (cents).
 * @param {string|number|null|undefined} input
 * @param {{ allowSubsen?: boolean }} [opts] the legacy export contains float
 *        artifacts ("49.800000000000004"); with allowSubsen they are rounded
 *        to the nearest sen — callers should surface a warning (see hasSubsenPrecision)
 * @returns {number} integer sen
 * @throws when the value is not a plain decimal number
 */
export function parseMoneyToCents(input, opts = {}) {
  if (input === null || input === undefined) return 0;
  const s = String(input).trim();
  if (s === '' || s === '-') return 0;
  const m = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) {
    throw new Error(`Unparseable money value: ${JSON.stringify(input)}`);
  }
  const sign = m[1] === '-' ? -1 : 1;
  const whole = parseInt(m[2], 10);
  const fracRaw = m[3] ?? '';
  if (fracRaw.length > 2) {
    if (!opts.allowSubsen) {
      throw new Error(`Money value has sub-sen precision: ${JSON.stringify(input)}`);
    }
    // Round to sen: first two fraction digits + half-up on the third.
    const base = whole * 100 + parseInt(fracRaw.slice(0, 2).padEnd(2, '0'), 10);
    const roundUp = parseInt(fracRaw[2] ?? '0', 10) >= 5 ? 1 : 0;
    const rounded = base + roundUp;
    return rounded === 0 ? 0 : sign * rounded;
  }
  const frac = parseInt(fracRaw.padEnd(2, '0') || '0', 10);
  const result = sign * (whole * 100 + frac);
  return result === 0 ? 0 : result; // normalize -0
}

/**
 * True when the raw export value carries float artifacts (more than 2 decimals).
 */
export function hasSubsenPrecision(input) {
  if (input === null || input === undefined) return false;
  const m = /^[+-]?\d+\.(\d+)$/.exec(String(input).trim());
  return !!m && m[1].length > 2;
}

/**
 * Format integer sen as an RM display string ("1930" -> "RM 19.30").
 * @param {number} cents
 */
export function centsToRm(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}RM ${(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Build a Malaysia (+08:00) ISO timestamp from the export's Date/Time columns.
 * @param {string} date "2026-03-01"
 * @param {string} time "16:50" (seconds optional)
 * @returns {string} ISO-8601 UTC instant
 */
export function legacyTimestampToIso(date, time) {
  if (!date) return null;
  const t = (time ?? '').trim() || '00:00';
  const parts = t.split(':');
  const hh = parts[0] ?? '00';
  const mm = parts[1] ?? '00';
  const ss = (parts[2] ?? '00').padEnd(2, '0');
  const iso = new Date(`${date}T${hh.padStart(2, '0')}:${mm.padStart(2, '0')}:${ss}+08:00`);
  if (Number.isNaN(iso.getTime())) {
    throw new Error(`Unparseable legacy timestamp: ${JSON.stringify([date, time])}`);
  }
  return iso.toISOString();
}
