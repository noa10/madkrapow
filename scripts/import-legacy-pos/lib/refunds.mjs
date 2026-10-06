// Refund pairing for the legacy Aliments POS export.
//
// Refunds are exported as TWO rows: the original order keeps its positive total
// but flips Payment Status to "REFUND", and a separate negative-total ORDER row
// (Table = "REFUND", no ITEM rows) records the money movement. We must link
// each negative record back to the original order and emit a refunds row
// instead of a second (negative) order.
//
// Pairing strategy, most-specific first:
//   1. Invoice match: "#0-00006942-canceled" → "#0-00006942" (strip suffix).
//   2. Amount + recency: among positive orders with |amount| equal and
//      timestamp strictly before the refund, take the most recent. (Verified
//      against the full export: every negative record pairs this way, and
//      every REFUND-status original finds a negative twin.)
// Each original is consumed by at most one refund.

import { parseMoneyToCents, legacyTimestampToIso } from './money.mjs';

/**
 * @typedef {Object} LegacyOrderRow raw ORDER record from the export
 */

/**
 * @param {LegacyOrderRow[]} orderRows all ORDER rows (positive + negative)
 * @returns {{
 *   refunds: Array<{ refundRow: LegacyOrderRow, originalRow: LegacyOrderRow, amountCents: number, refundedAtIso: string, strategy: string }>,
 *   unmatchedRefunds: LegacyOrderRow[]
 * }}
 */
export function pairRefunds(orderRows) {
  const negatives = orderRows.filter(
    (r) => parseMoneyToCents(r['Total Gross Sales'], { allowSubsen: true }) < 0
  );
  const positives = orderRows.filter(
    (r) => parseMoneyToCents(r['Total Gross Sales'], { allowSubsen: true }) > 0
  )
    .map((row) => ({
      row,
      amountCents: parseMoneyToCents(row['Total Gross Sales'], { allowSubsen: true }),
      ts: timestampOf(row),
      invoice: (row['Invoice No'] ?? '').trim(),
      consumed: false,
    }));

  const refunds = [];
  const unmatchedRefunds = [];

  for (const neg of negatives) {
    const amountCents = Math.abs(
      parseMoneyToCents(neg['Total Gross Sales'], { allowSubsen: true })
    );
    const negTs = timestampOf(neg);
    const negInvoice = (neg['Invoice No'] ?? '').trim();

    // 1. Direct invoice match ("#0-00006942-canceled" -> "#0-00006942").
    const invoiceBase = negInvoice.replace(/-[^-]*$/, '');
    let match = positives.find(
      (p) => !p.consumed && p.invoice && p.invoice === invoiceBase
    );
    let strategy = 'invoice';

    // 2. Same amount, most recent original strictly before the refund.
    if (!match) {
      const candidates = positives
        .filter(
          (p) => !p.consumed && p.amountCents === amountCents && p.ts <= negTs
        )
        .sort((a, b) => (a.ts < b.ts ? 1 : -1));
      match = candidates[0];
      strategy = 'amount+recency';
    }

    if (!match) {
      unmatchedRefunds.push(neg);
      continue;
    }
    match.consumed = true;
    refunds.push({
      refundRow: neg,
      originalRow: match.row,
      linkedInvoice: match.invoice,
      linkedSystemId: String(match.row['System ID'] ?? '').trim(),
      amountCents,
      refundedAtIso: negTs,
      strategy,
    });
  }

  return { refunds, unmatchedRefunds };
}

function timestampOf(row) {
  return legacyTimestampToIso(row['Date'], row['Time']) ?? '';
}
