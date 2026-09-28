import { describe, it, expect } from 'vitest';
import { pairRefunds } from '../lib/refunds.mjs';

function order(invoice, amount, date, time) {
  return {
    'Record Type': 'ORDER',
    'Invoice No': invoice,
    'Total Gross Sales': amount,
    Date: date,
    Time: time,
    'System ID': `sys-${invoice}`,
  };
}

describe('pairRefunds', () => {
  it('pairs a "-canceled" refund by direct invoice match', () => {
    const rows = [
      order('#0-00006942', '33.6', '2026-04-03', '16:49'),
      order('#0-00006942-canceled', '-33.6', '2026-04-03', '17:14'),
    ];
    const { refunds, unmatchedRefunds } = pairRefunds(rows);
    expect(unmatchedRefunds).toHaveLength(0);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].linkedInvoice).toBe('#0-00006942');
    expect(refunds[0].amountCents).toBe(3360);
    expect(refunds[0].strategy).toBe('invoice');
  });

  it('pairs by amount + most-recent-preceding when invoices differ', () => {
    const rows = [
      order('#1-00000424', '10', '2026-03-01', '18:43'),
      order('#1-00000425', '-10', '2026-03-01', '18:43'),
      order('#1-00000479', '10', '2026-03-09', '19:07'),
      order('#1-00000480', '-10', '2026-03-09', '19:08'),
    ];
    const { refunds, unmatchedRefunds } = pairRefunds(rows);
    expect(unmatchedRefunds).toHaveLength(0);
    expect(refunds.map((r) => r.linkedInvoice)).toEqual([
      '#1-00000424',
      '#1-00000479',
    ]);
  });

  it('does not match an original AFTER the refund (05:00 vs 23:00)', () => {
    const rows = [
      order('#1-00000901', '-5', '2026-03-04', '17:29'),
      order('#1-00000902', '5', '2026-03-04', '23:00'),
    ];
    const { refunds, unmatchedRefunds } = pairRefunds(rows);
    expect(refunds).toHaveLength(0);
    expect(unmatchedRefunds).toHaveLength(1);
  });

  it('consumes originals so two same-amount refunds pair to two originals', () => {
    // Real case from 2026-03-04: two RM5 refunds (#443, #444) vs originals #438 (16:49) and #440 (17:25).
    const rows = [
      order('#1-00000438', '5', '2026-03-04', '16:49'),
      order('#1-00000440', '5', '2026-03-04', '17:25'),
      order('#1-00000443', '-5', '2026-03-04', '17:29'),
      order('#1-00000444', '-5', '2026-03-04', '17:30'),
    ];
    const { refunds, unmatchedRefunds } = pairRefunds(rows);
    expect(unmatchedRefunds).toHaveLength(0);
    expect(refunds).toHaveLength(2);
    // #443 (17:29) -> most recent preceding = #440 (17:25); #444 -> #438.
    const linked = refunds.map((r) => r.linkedInvoice).sort();
    expect(linked).toEqual(['#1-00000438', '#1-00000440']);
  });

  it('ignores positive REFUND-status rows as refund sources (they are the originals)', () => {
    const rows = [
      { ...order('#1-00000418', '18', '2026-03-01', '16:50'), 'Payment Status': 'REFUND' },
      order('#1-00000420', '-18', '2026-03-01', '17:08'),
    ];
    const { refunds } = pairRefunds(rows);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].linkedInvoice).toBe('#1-00000418');
  });
});
