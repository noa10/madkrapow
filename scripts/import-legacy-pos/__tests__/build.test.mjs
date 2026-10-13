import { describe, it, expect } from 'vitest';
import { buildImportModel } from '../lib/build.mjs';

// Minimal fixture shaped exactly like the real export (2026-03 → 2026-05).
function orderRow(overrides) {
  return {
    'Payment Remarks': null,
    Cashier: 'Mad Krapow - Desa Subang Permai',
    'Payment Method': 'PAY_AT_COUNTER',
    'Invoice No': '#1-00000418',
    'Total Gross Sales': '18',
    Remarks: null,
    'Payment Status': 'SUCCESS',
    'Total Nett Sales': '18',
    'Counter Payment Method': 'QR Pay',
    Date: '2026-03-01',
    Rounding: '0',
    'System ID': '5a0bea1d-ade6-4d23-9f1a-cb360a52f3b6',
    'Record Type': 'ORDER',
    'Total Discount': '0',
    Table: 'Counter',
    order_group: '144866542',
    'No of Pax': '1',
    Time: '16:50',
    ...overrides,
  };
}

function itemRow(orderGroup, items, rowNum = 1) {
  return {
    'Record Type': 'ITEM',
    Items: items,
    order_group: orderGroup,
    row_num: rowNum,
  };
}

describe('buildImportModel', () => {
  it('builds a complete model for a counter order with items', () => {
    const rows = [
      orderRow({}),
      itemRow('144866542', '2x Krapow Kentang (Kecil) | 10 | Ayam'),
      itemRow('144866542', '1x Popiah Krapow | 4 | Ayam', 2),
      itemRow('144866542', '1x Popiah Krapow | 4 | Daging', 3),
    ];
    const model = buildImportModel(rows);

    expect(model.errors).toEqual([]);
    expect(model.warnings).toEqual([]);
    expect(model.orders).toHaveLength(1);

    const o = model.orders[0];
    expect(o.order).toMatchObject({
      order_number: 'LEG-1-00000418',
      display_code: '#1-00000418',
      status: 'delivered',
      source: 'counter',
      delivery_type: 'self_pickup',
      subtotal_cents: 1800,
      discount_cents: 0,
      total_cents: 1800,
      customer_name: 'Walk-in',
      created_at: '2026-03-01T08:50:00.000Z',
    });
    expect(o.items).toHaveLength(3);
    expect(o.items[0]).toMatchObject({
      quantity: 2,
      menu_item_price_cents: 500,
      line_total_cents: 1000,
    });
    expect(o.payment).toMatchObject({ method: 'qr_pay', amount_cents: 1800 });
    expect(o.channelOrder).toMatchObject({
      channel: 'legacy_pos',
      external_order_id: '5a0bea1d-ade6-4d23-9f1a-cb360a52f3b6',
      external_order_number: '#1-00000418',
    });
  });

  it('maps GrabFood orders with GF number, cutlery, discount and markup prices', () => {
    const rows = [
      orderRow({
        'Invoice No': '#0-00006849',
        Cashier: 'GrabFood Robot',
        'Counter Payment Method': 'GrabFood',
        Remarks: 'GF-186 (cutlery - no)',
        'Total Gross Sales': '29.8',
        'Total Nett Sales': '22.8',
        'Total Discount': '7',
        Table: 'GrabFood',
        'System ID': '0013064431-C73GEBEFACNFFE-1-C36JLBD2PFD3LA',
        order_group: '145164408',
        Date: '2026-03-04',
        Time: '18:34',
      }),
      itemRow('145164408', '1x Set Krapow Daging | 13'),
      itemRow('145164408', '3x Popiah Krapow Daging | 16.8', 2),
    ];
    const model = buildImportModel(rows);

    expect(model.errors).toEqual([]);
    const o = model.orders[0];
    expect(o.order.source).toBe('grabfood');
    expect(o.order.delivery_type).toBe('delivery');
    expect(o.order.include_cutlery).toBe(false);
    expect(o.order.discount_cents).toBe(700);
    expect(o.order.total_cents).toBe(2280);
    expect(o.payment.method).toBe('grabfood');
    expect(o.channelOrder).toMatchObject({
      channel: 'grabfood',
      external_order_number: 'GF-186',
    });
    // Item prices snapshot the GrabFood markup (1300 / 560), not the counter price.
    expect(o.items[0].menu_item_price_cents).toBe(1300);
    expect(o.items[1].menu_item_price_cents).toBe(560);
  });

  it('turns a refund pair into one order + one refund (never a negative order)', () => {
    const rows = [
      orderRow({
        'Payment Status': 'REFUND',
        'Invoice No': '#1-00000424',
        'Total Gross Sales': '10',
        'Total Nett Sales': '10',
        'Counter Payment Method': 'Cash',
        'System ID': 'sys-orig',
        order_group: 'g-orig',
      }),
      itemRow('g-orig', '1x Krapow Kentang (Besar) | 10 | Daging'),
      orderRow({
        'Invoice No': '#1-00000425',
        'Total Gross Sales': '-10',
        'Total Nett Sales': '-10',
        Table: 'REFUND',
        'System ID': 'sys-refund',
        order_group: 'g-refund',
        Time: '18:44',
      }),
    ];
    const model = buildImportModel(rows);

    expect(model.orders).toHaveLength(1);
    expect(model.orders[0].order.order_number).toBe('LEG-1-00000424');
    expect(model.refunds).toHaveLength(1);
    expect(model.refunds[0]).toMatchObject({
      linkedInvoice: '#1-00000424',
      amountCents: 1000,
      method: 'cash',
    });
    expect(model.warnings).toEqual([]);
  });

  it('collects unmapped items and item-sum mismatches as errors, not broken rows', () => {
    const rows = [
      orderRow({ 'Invoice No': '#1-9', 'System ID': 'sys-9', order_group: 'g-9' }),
      itemRow('g-9', '1x Mystery Rendang | 10'),
      orderRow({
        'Invoice No': '#1-10',
        'System ID': 'sys-10',
        order_group: 'g-10',
        'Total Gross Sales': '99',
      }),
      itemRow('g-10', '1x Set Krapow Daging | 13'),
    ];
    const model = buildImportModel(rows);

    expect(model.orders).toHaveLength(0);
    expect(model.errors).toHaveLength(2);
    expect(model.errors.map((e) => e.invoice)).toEqual(['#1-9', '#1-10']);
  });

  it('warns when gross - discount != nett but still uses nett as total', () => {
    const rows = [
      orderRow({
        'Invoice No': '#1-11',
        'System ID': 'sys-11',
        order_group: 'g-11',
        'Total Gross Sales': '10',
        'Total Discount': '1',
        'Total Nett Sales': '10',
      }),
      itemRow('g-11', '1x Krapow Kentang (Besar) | 10 | Daging'),
    ];
    const model = buildImportModel(rows);
    expect(model.orders).toHaveLength(1);
    expect(model.orders[0].order.total_cents).toBe(1000);
    expect(model.warnings[0]).toMatch(/gross 1000 - discount 100 != nett 1000/);
  });

  it('computes per-channel stats for the reconciliation report', () => {
    const rows = [
      orderRow({}),
      itemRow('144866542', '2x Krapow Kentang (Kecil) | 10 | Ayam'),
      itemRow('144866542', '1x Popiah Krapow | 4 | Ayam', 2),
      itemRow('144866542', '1x Popiah Krapow | 4 | Daging', 3),
    ];
    const model = buildImportModel(rows);
    expect(model.stats.perChannel.counter).toEqual({
      orders: 1,
      grossCents: 1800,
      discountCents: 0,
      nettCents: 1800,
    });
    expect(model.stats.totalGrossCents).toBe(1800);
    expect(model.stats.refunds).toBe(0);
  });
});
