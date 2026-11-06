import { describe, expect, it } from 'vitest';

import { parseCsvRecords } from '../lib/csv.mjs';
import { resolveMenuKey, MENU } from '../lib/menu-map.mjs';
import { buildImportModel, parseRemarks } from '../lib/build.mjs';

describe('csv', () => {
  it('keeps commas and doubled quotes inside quoted cells', () => {
    const text =
      'Date,Items,Total\r\n' +
      '2025-04-03,"1x Set Krapow Daging | 12.5 | Biasa, 135g - Default, ""Food Container""",12.5\r\n';
    const [row] = parseCsvRecords(text);
    expect(row.Date).toBe('2025-04-03');
    expect(row.Items).toBe('1x Set Krapow Daging | 12.5 | Biasa, 135g - Default, "Food Container"');
    expect(row.Total).toBe('12.5');
  });
});

describe('menu mapping', () => {
  it('maps the pre-rename names onto today’s catalog', () => {
    expect(resolveMenuKey('Beef Krapow Set', '').key).toBe('SET_DAGING');
    expect(resolveMenuKey('Chicken Krapow Set', 'Extra Spicy 🌶️🌶️🌶️').key).toBe('SET_AYAM');
    expect(resolveMenuKey('Beef Krapow Only', '').key).toBe('KRAPOW_DAGING_SAHAJA');
    expect(resolveMenuKey('Rice', '').key).toBe('NASI_PUTIH_SIAM');
    expect(resolveMenuKey('Fried Egg', '').key).toBe('TELUR_GORENG');
  });

  it('resolves size and protein whichever field carries them', () => {
    // size in the qualifier
    expect(resolveMenuKey('Krapow Kentang Daging', '10 | Besar').key).toBe('KENTANG_DAGING_BESAR');
    // size in the name, protein in the qualifier
    expect(resolveMenuKey('Krapow Kentang (Kecil)', '5 | Ayam').key).toBe('KENTANG_AYAM_KECIL');
    // bare set + protein in the qualifier
    expect(resolveMenuKey('Set Krapow', '10 | Daging').key).toBe('SET_DAGING');
    expect(resolveMenuKey('Popiah Krapow', '4 | Ayam').key).toBe('POPIAH_AYAM');
  });

  it('defaults the two protein-less counter rows to beef and flags it', () => {
    const r = resolveMenuKey('Krapow Kentang (Besar)', '10');
    expect(r.key).toBe('KENTANG_DAGING_BESAR');
    expect(r.warning).toMatch(/defaulted to daging/);
  });

  it('leaves unknown names unmapped so the importer fails loudly', () => {
    expect(resolveMenuKey('Mystery Dish', '').key).toBeNull();
  });
});

describe('buildImportModel', () => {
  const orderRow = (over = {}) => ({
    'Record Type': 'ORDER',
    order_group: '111',
    Date: '2025-04-03',
    Time: '19:59',
    'Invoice No': '#0-00004020',
    'System ID': 'sys-1',
    'Payment Status': 'SUCCESS',
    Table: 'GrabFood',
    'Total Gross Sales': '45.5',
    'Total Discount': '3.4',
    'Total Nett Sales': '42.1',
    'Payment Method': 'PAY_AT_COUNTER',
    'Counter Payment Method': 'GrabFood',
    Remarks: 'GF-209 (cutlery - no)',
    ...over,
  });

  const itemRow = (over = {}) => ({
    'Record Type': 'ITEM',
    order_group: '111',
    'Invoice No': '',
    'System ID': '',
    Items: '1x Set Krapow Daging | 45.5 | Biasa 🌶️, 135g - Default',
    ...over,
  });

  it('builds an order with channel identity, payment and items', () => {
    const model = buildImportModel([orderRow(), itemRow()]);
    expect(model.errors).toEqual([]);
    expect(model.orders).toHaveLength(1);
    const [o] = model.orders;
    expect(o.order).toMatchObject({
      order_number: 'HUB-0-00004020',
      display_code: '0-00004020',
      status: 'delivered',
      source: 'grabfood',
      delivery_type: 'delivery',
      subtotal_cents: 4550,
      discount_cents: 340,
      total_cents: 4210,
      include_cutlery: false,
    });
    expect(o.payment).toMatchObject({ method: 'grabfood', amount_cents: 4210, external_ref: 'sys-1' });
    // The list-surface snapshot mirrors the ledger method (migration 079).
    expect(o.order.payment_method).toBe('grabfood');
    expect(o.channelOrder).toMatchObject({
      channel: 'grabfood',
      external_order_id: 'sys-1',
      external_order_number: 'GF-209',
      external_status: 'SUCCESS',
    });
    expect(o.items[0]).toMatchObject({
      menu_item_id: MENU.SET_DAGING,
      menu_item_name: 'Set Krapow Daging',
      menu_item_price_cents: 4550,
      quantity: 1,
      line_total_cents: 4550,
    });
  });

  it('stores ShopeeFood as its own source, channel and payment method', () => {
    const model = buildImportModel([
      orderRow({ Table: 'ShopeeFood', Remarks: 'SF231', 'Counter Payment Method': 'ShopeeFood' }),
      itemRow({ Items: '1x Set Krapow Ayam | 45.5' }),
    ]);
    const [o] = model.orders;
    expect(o.order.source).toBe('shopeefood');
    expect(o.order.notes).toBeNull();
    expect(o.channelOrder.channel).toBe('shopeefood');
    expect(o.channelOrder.external_order_number).toBe('SF231');
    expect(o.payment.method).toBe('shopeefood');
    expect(o.order.payment_method).toBe('shopeefood');
  });

  it('attaches a negative row to the order it reverses instead of creating one', () => {
    const refund = orderRow({
      order_group: '999',
      Date: '2025-04-07',
      Time: '14:25',
      'Invoice No': '#1-00000224',
      'System ID': 'sys-refund',
      Table: 'REFUND',
      'Total Gross Sales': '-45.5',
      'Total Discount': '-3.4',
      'Total Nett Sales': '-42.1',
      Remarks: '',
    });
    const model = buildImportModel([orderRow(), itemRow(), refund]);
    expect(model.orders).toHaveLength(1);
    expect(model.stats.refunds).toBe(1);
    expect(model.stats.unmatchedRefunds).toBe(0);
    expect(model.orders[0].refunds[0]).toMatchObject({ amountCents: 4550, systemId: 'sys-refund' });
  });

  it('suffixes a repeated invoice so order_number stays unique', () => {
    const model = buildImportModel([
      orderRow(),
      itemRow(),
      orderRow({ 'System ID': 'sys-2', 'Invoice No': '#0-00004020', Time: '20:30', order_group: '222' }),
      itemRow({ order_group: '222' }),
    ]);
    const numbers = model.orders.map((o) => o.order.order_number);
    expect(numbers).toEqual(['HUB-0-00004020', 'HUB-0-00004020-2']);
    expect(new Set(numbers).size).toBe(2);
  });

  it('rejects an order whose line totals do not add up to the gross', () => {
    const model = buildImportModel([orderRow(), itemRow({ Items: '1x Set Krapow Daging | 10' })]);
    expect(model.orders).toHaveLength(0);
    expect(model.errors[0].error).toMatch(/item sum 1000 != gross 4550/);
  });
});

describe('parseRemarks', () => {
  it('reads platform order numbers and the cutlery flag', () => {
    expect(parseRemarks('GF-714 (cutlery - no)')).toEqual({
      externalOrderNumber: 'GF-714',
      cutlery: false,
    });
    expect(parseRemarks('GF-1253T (cutlery - yes)').externalOrderNumber).toBe('GF-1253T');
    expect(parseRemarks('#1552').externalOrderNumber).toBe('#1552');
    expect(parseRemarks('SF235T').externalOrderNumber).toBe('SF235T');
    expect(parseRemarks('')).toEqual({ externalOrderNumber: null, cutlery: null });
  });
});
