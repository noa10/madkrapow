// Assembles the import model from the HubboPOS "Order with Items" export.
//
// Export shape (one row per record, ITEM rows link to their ORDER via
// `order_group`, never via System ID — ITEM rows carry an empty System ID):
//
//   Record Type=ORDER  #0-00002566 …  Total Gross Sales 22.2 …
//   Record Type=ITEM   …              Items "1x Set Krapow Daging | 16.6 | Biasa 🌶️, …"
//
// Canonical mapping:
//   items sum          -> orders.subtotal_cents (equals Total Gross Sales on
//                         every one of the 6,509 orders that has item rows)
//   Total Discount     -> orders.discount_cents
//   Total Nett Sales   -> orders.total_cents (what the customer paid)
//   negative ORDER row -> refunds row linked to the order it reverses
//
// Channel is read from the export's `Table` column (GrabFood / FoodPanda /
// ShopeeFood / Counter). `counter` orders are POS walk-ins booked with
// channel_orders `legacy_pos`; 078 widened the CHECK constraints so ShopeeFood
// is stored under its own value.

import { parseMoneyToCents, legacyTimestampToIso, hasSubsenPrecision } from '../../import-legacy-pos/lib/money.mjs';
import { qualifierTokensToNotes } from '../../import-legacy-pos/lib/items.mjs';
import { pairRefunds } from '../../import-legacy-pos/lib/refunds.mjs';
import { MENU, resolveMenuKey } from './menu-map.mjs';

export const OUTLET = 'Mad Krapow - Desa Subang Permai';

const CHANNEL_BY_TABLE = {
  grabfood: 'grabfood',
  foodpanda: 'foodpanda',
  shopeefood: 'shopeefood',
  counter: 'counter',
};

const PAYMENT_BY_METHOD = {
  cash: 'cash',
  'qr pay': 'qr_pay',
  grabfood: 'grabfood',
  foodpanda: 'foodpanda',
  shopeefood: 'shopeefood',
  '': 'other',
};

/** Channel values the orders.source CHECK constraint accepts (078 adds shopeefood). */
const SOURCE_STORAGE = {
  grabfood: 'grabfood',
  foodpanda: 'foodpanda',
  counter: 'counter',
  shopeefood: 'shopeefood',
};

/** Channel values the channel_orders.channel CHECK constraint accepts. */
const CHANNEL_ORDER_STORAGE = {
  grabfood: 'grabfood',
  foodpanda: 'foodpanda',
  counter: 'legacy_pos',
  shopeefood: 'shopeefood',
};

function classify(table) {
  return CHANNEL_BY_TABLE[(table ?? '').trim().toLowerCase()] ?? null;
}

/**
 * Platform order reference from the export's Remarks column:
 *   GrabFood   "GF-714 (cutlery - no)" / "GF-1253T (cutlery - yes)"
 *   FoodPanda  "#1552"
 *   ShopeeFood "SF231" / "SF235T"
 */
export function parseRemarks(remarks) {
  const r = (remarks ?? '').trim();
  if (!r) return { externalOrderNumber: null, cutlery: null };
  const cutleryMatch = /cutlery\s*-\s*(yes|no)/i.exec(r);
  const cutlery = cutleryMatch ? cutleryMatch[1].toLowerCase() === 'yes' : null;

  const gf = /^GF-[0-9]+[A-Z]?/i.exec(r);
  if (gf) return { externalOrderNumber: gf[0].toUpperCase(), cutlery };
  const fp = /^#[0-9]+/.exec(r);
  if (fp) return { externalOrderNumber: fp[0], cutlery };
  const sf = /^SF[0-9]+[A-Z]?/i.exec(r);
  if (sf) return { externalOrderNumber: sf[0].toUpperCase(), cutlery };
  return { externalOrderNumber: null, cutlery };
}

/**
 * Parse one ITEM row's "Items" string:
 *   "2x Set Krapow Daging | 25 | Biasa 🌶️, 135g - Default, Food Container (Photodegradable)"
 * Field 2 is the LINE total (qty × unit), not the unit price.
 */
export function parseItemString(raw) {
  const parts = String(raw).split('|').map((s) => s.trim());
  const qtyMatch = /^(\d+)\s*x\s*(.+)$/i.exec(parts[0] ?? '');
  if (!qtyMatch) throw new Error(`Unparseable item line: ${JSON.stringify(raw)}`);
  const quantity = parseInt(qtyMatch[1], 10);
  const rawName = qtyMatch[2].trim();
  const lineTotalCents = parseMoneyToCents(parts[1] ?? '0', { allowSubsen: true });
  const qualifier = parts.slice(2).join(' | ');

  if (quantity < 1) throw new Error(`Invalid quantity: ${JSON.stringify(raw)}`);
  if (lineTotalCents % quantity !== 0) {
    throw new Error(`Line total ${lineTotalCents}sen not divisible by qty ${quantity}: ${JSON.stringify(raw)}`);
  }

  const { key, note, warning } = resolveMenuKey(rawName, qualifier);
  const tokens = qualifier
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const notes = [note, qualifierTokensToNotes(tokens)].filter(Boolean).join(' | ');

  return {
    quantity,
    rawName,
    lineTotalCents,
    unitPriceCents: lineTotalCents / quantity,
    qualifier,
    menuKey: key,
    menuItemId: key ? MENU[key] : null,
    displayName: rawName,
    notes: notes || null,
    warning: warning ?? null,
  };
}

/**
 * @param {Array<Record<string, string>>} rows records from the CSV export
 */
export function buildImportModel(rows) {
  const warnings = [];
  const errors = [];

  const orderRows = rows.filter((r) => (r['Record Type'] ?? '').trim() === 'ORDER');
  const itemRows = rows.filter((r) => (r['Record Type'] ?? '').trim() === 'ITEM');

  // ITEM → ORDER link is order_group (ITEM System ID is always empty).
  const itemsByGroup = new Map();
  for (const row of itemRows) {
    const group = String(row['order_group'] ?? '').trim();
    if (!group) continue;
    if (!itemsByGroup.has(group)) itemsByGroup.set(group, []);
    itemsByGroup.get(group).push(row);
  }

  const { refunds, unmatchedRefunds } = pairRefunds(orderRows);
  const refundRowSet = new Set(refunds.map((r) => r.refundRow));

  const orders = [];
  /** invoice → occurrences seen so far (see order_number note below). */
  const invoiceSeen = new Map();

  for (const row of orderRows) {
    const invoice = (row['Invoice No'] ?? '').trim();
    const systemId = String(row['System ID'] ?? '').trim();
    const grossCents = parseMoneyToCents(row['Total Gross Sales'], { allowSubsen: true });

    // Negative rows are refund records; they are attached to their original.
    if (grossCents <= 0 || refundRowSet.has(row)) continue;

    const table = (row['Table'] ?? '').trim();
    const channel = classify(table);
    if (!channel) {
      errors.push({ invoice, error: `unknown channel in Table column: ${JSON.stringify(table)}` });
      continue;
    }
    if (!systemId) {
      errors.push({ invoice, error: 'missing System ID' });
      continue;
    }

    const placedAtIso = legacyTimestampToIso(row['Date'], row['Time']);
    const discountCents = Math.abs(
      parseMoneyToCents(row['Total Discount'] ?? '0', { allowSubsen: true })
    );
    const nettCents = parseMoneyToCents(row['Total Nett Sales'] ?? row['Total Gross Sales'], {
      allowSubsen: true,
    });
    if (hasSubsenPrecision(row['Total Gross Sales']) || hasSubsenPrecision(row['Total Nett Sales'])) {
      warnings.push(`${invoice}: float-artifact money value rounded to sen`);
    }

    const rawItems = itemsByGroup.get(String(row['order_group'] ?? '').trim()) ?? [];
    const parsedItems = [];
    let itemError = null;
    for (const itemRow of rawItems) {
      try {
        const parsed = parseItemString(itemRow['Items']);
        if (!parsed.menuItemId) {
          itemError = `unmapped catalog item: ${JSON.stringify(parsed.rawName)}`;
          break;
        }
        if (parsed.warning) warnings.push(`${invoice}: ${parsed.warning}`);
        parsedItems.push({ parsed, raw: itemRow });
      } catch (err) {
        itemError = `item parse failure: ${err.message}`;
        break;
      }
    }
    if (itemError) {
      errors.push({ invoice, error: itemError });
      continue;
    }

    const itemsSumCents = parsedItems.reduce((a, { parsed }) => a + parsed.lineTotalCents, 0);
    if (parsedItems.length > 0 && itemsSumCents !== grossCents) {
      errors.push({
        invoice,
        error: `item sum ${itemsSumCents} != gross ${grossCents}`,
      });
      continue;
    }
    if (parsedItems.length === 0) {
      // 45 orders from 2024-11-01…04 have no ITEM rows at all (item detail was
      // not captured in the first days of POS go-live). Import the header.
      warnings.push(`${invoice}: no ITEM rows — imported as header-only order`);
    }

    const { externalOrderNumber, cutlery } = parseRemarks(row['Remarks']);
    // Invoice numbers are not unique in the POS (two concurrent platform
    // orders can share one: 2025-05-26 ShopeeFood, 2025-11-14 GrabFood), and
    // orders.order_number is UNIQUE — suffix the repeats deterministically.
    invoiceSeen.set(invoice, (invoiceSeen.get(invoice) ?? 0) + 1);
    const occurrence = invoiceSeen.get(invoice);
    const orderNumber = `HUB-${invoice.replace(/^#/, '')}${occurrence > 1 ? `-${occurrence}` : ''}`;
    const displayCode = `${invoice.replace(/^#/, '')}${occurrence > 1 ? `-${occurrence}` : ''}`;
    const paymentMethod = PAYMENT_BY_METHOD[(row['Counter Payment Method'] ?? '').trim().toLowerCase()] ?? 'other';

    orders.push({
      legacy: {
        invoice,
        systemId,
        orderGroup: String(row['order_group'] ?? '').trim(),
        outlet: OUTLET,
        date: row['Date'],
        time: row['Time'],
      },
      order: {
        order_number: orderNumber,
        display_code: displayCode,
        status: 'delivered',
        source: SOURCE_STORAGE[channel],
        delivery_type: channel === 'counter' ? 'self_pickup' : 'delivery',
        fulfillment_type: 'asap',
        subtotal_cents: grossCents,
        discount_cents: discountCents,
        delivery_fee_cents: 0,
        total_cents: nettCents,
        customer_id: null,
        customer_name: channel === 'counter' ? 'Walk-in' : null,
        notes: null,
        include_cutlery: cutlery ?? true,
        created_at: placedAtIso,
        updated_at: placedAtIso,
      },
      items: parsedItems.map(({ parsed }) => ({
        menu_item_id: parsed.menuItemId,
        menu_item_name: parsed.displayName,
        menu_item_price_cents: parsed.unitPriceCents,
        quantity: parsed.quantity,
        line_total_cents: parsed.lineTotalCents,
        notes: parsed.notes,
      })),
      payment: {
        method: paymentMethod,
        amount_cents: nettCents,
        paid_at: placedAtIso,
        external_ref: systemId,
      },
      channelOrder: {
        channel: CHANNEL_ORDER_STORAGE[channel],
        external_order_id: systemId,
        external_order_number: externalOrderNumber ?? invoice.replace(/^#/, ''),
        external_store_id: OUTLET,
        external_status: (row['Payment Status'] ?? '').trim() || null,
      },
      rawOrder: row,
      rawItems,
      _channel: channel,
    });
  }

  // Attach refunds to the order they reverse — the RPC writes them atomically
  // with that order.
  const refundsByInvoice = new Map();
  for (const r of refunds) {
    const model = {
      amountCents: r.amountCents,
      refundedAtIso: r.refundedAtIso,
      systemId: String(r.refundRow['System ID'] ?? '').trim(),
      invoice: (r.refundRow['Invoice No'] ?? '').trim(),
      reason: `HubboPOS refund/cancel (${(r.refundRow['Invoice No'] ?? '').trim()}, matched by ${r.strategy})`,
      raw: r.refundRow,
      linkedInvoice: r.linkedInvoice,
    };
    if (!refundsByInvoice.has(model.linkedInvoice)) refundsByInvoice.set(model.linkedInvoice, []);
    refundsByInvoice.get(model.linkedInvoice).push(model);
  }
  for (const o of orders) {
    o.refunds = refundsByInvoice.get(o.legacy.invoice) ?? [];
  }

  for (const neg of unmatchedRefunds) {
    warnings.push(
      `unmatched refund record: ${(neg['Invoice No'] ?? '').trim()} (${neg['Total Gross Sales']})`
    );
  }

  const perChannel = {};
  for (const o of orders) {
    const key = o._channel;
    perChannel[key] ??= { orders: 0, grossCents: 0, discountCents: 0, nettCents: 0, refunds: 0, refundCents: 0 };
    perChannel[key].orders += 1;
    perChannel[key].grossCents += o.order.subtotal_cents;
    perChannel[key].discountCents += o.order.discount_cents;
    perChannel[key].nettCents += o.order.total_cents;
    perChannel[key].refunds += o.refunds.length;
    perChannel[key].refundCents += o.refunds.reduce((a, r) => a + r.amountCents, 0);
  }

  const stats = {
    totalRows: rows.length,
    orderRows: orderRows.length,
    itemRows: itemRows.length,
    importedOrders: orders.length,
    headerOnlyOrders: orders.filter((o) => o.items.length === 0).length,
    itemLines: orders.reduce((a, o) => a + o.items.length, 0),
    errorOrders: errors.length,
    refunds: orders.reduce((a, o) => a + o.refunds.length, 0),
    unmatchedRefunds: unmatchedRefunds.length,
    perChannel,
    totalGrossCents: orders.reduce((a, o) => a + o.order.subtotal_cents, 0),
    totalDiscountCents: orders.reduce((a, o) => a + o.order.discount_cents, 0),
    totalNettCents: orders.reduce((a, o) => a + o.order.total_cents, 0),
    firstOrderAt: orders.reduce((a, o) => (a === null || o.order.created_at < a ? o.order.created_at : a), null),
    lastOrderAt: orders.reduce((a, o) => (a === null || o.order.created_at > a ? o.order.created_at : a), null),
  };

  return { orders, warnings, errors, stats };
}
