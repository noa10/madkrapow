// Assembles the complete import model from raw legacy export rows.
//
// Canonical mapping (validated against the full export: 816 orders, 1207 items,
// 0 item-sum mismatches):
//   items sum      -> orders.subtotal_cents   (Total Gross Sales)
//   Total Discount -> orders.discount_cents
//   Total Nett     -> orders.total_cents      (what the customer actually paid)
//   negative ORDER rows (Table=REFUND) -> refunds linked to their original order
//
// Order status is 'delivered' for every imported sale — refunds are recorded as
// refunds, never as status changes or negative orders. Historical platform
// identities (System ID, GF-xxx/#xxxx numbers) are preserved in channel_orders.

import { parseMoneyToCents, legacyTimestampToIso, hasSubsenPrecision } from './money.mjs';
import { parseItemString } from './items.mjs';
import { classifyChannel, mapPaymentMethod, parseRemarks } from './classify.mjs';
import { pairRefunds } from './refunds.mjs';

export const LEGACY_OUTLET = 'Mad Krapow - Desa Subang Permai';

/**
 * @param {Array<Record<string, unknown>>} rows raw export array
 * @returns {import model}
 */
export function buildImportModel(rows) {
  const warnings = [];
  const errors = [];

  const orderRows = rows.filter((r) => r['Record Type'] === 'ORDER');
  const itemRows = rows.filter((r) => r['Record Type'] === 'ITEM');

  // Group item rows by order_group (export links ITEM -> ORDER via order_group).
  const itemsByGroup = new Map();
  for (const row of itemRows) {
    const group = String(row['order_group'] ?? '');
    if (!itemsByGroup.has(group)) itemsByGroup.set(group, []);
    itemsByGroup.get(group).push(row);
  }

  const { refunds, unmatchedRefunds } = pairRefunds(orderRows);
  const refundRowSet = new Set(refunds.map((r) => r.refundRow));

  const orders = [];

  for (const row of orderRows) {
    const invoice = (row['Invoice No'] ?? '').trim();
    const systemId = String(row['System ID'] ?? '').trim();
    const grossCents = parseMoneyToCents(row['Total Gross Sales'], { allowSubsen: true });

    // Negative rows are refund records, not orders.
    if (grossCents < 0 || refundRowSet.has(row)) continue;

    const group = String(row['order_group'] ?? '');
    const placedAtIso = legacyTimestampToIso(row['Date'], row['Time']);
    const channel = classifyChannel(row);
    const method = mapPaymentMethod(row);
    const discountCents = Math.abs(
      parseMoneyToCents(row['Total Discount'] ?? '0', { allowSubsen: true })
    );
    const nettCents = parseMoneyToCents(row['Total Nett Sales'] ?? row['Total Gross Sales'], {
      allowSubsen: true,
    });
    if (hasSubsenPrecision(row['Total Gross Sales']) || hasSubsenPrecision(row['Total Nett Sales'])) {
      warnings.push(
        `${invoice}: float-artifact money value in export (${row['Total Gross Sales']} / ${row['Total Nett Sales']}) — rounded to sen`
      );
    }
    const remarks = (row['Remarks'] ?? '').trim();
    const { externalOrderNumber, cutlery } = parseRemarks(remarks);

    // --- item lines ---
    const rawItems = itemsByGroup.get(group) ?? [];
    if (rawItems.length === 0) {
      errors.push({ invoice, error: 'positive order has no ITEM rows' });
      continue;
    }
    let parsedItems;
    try {
      parsedItems = rawItems.map((r) => ({
        parsed: parseItemString(r['Items']),
        raw: r,
      }));
    } catch (err) {
      errors.push({ invoice, error: `item parse failure: ${err.message}` });
      continue;
    }

    // --- money validation: items must sum to gross ---
    const itemsSumCents = parsedItems.reduce(
      (a, { parsed }) => a + parsed.lineTotalCents,
      0
    );
    if (itemsSumCents !== grossCents) {
      errors.push({
        invoice,
        error: `item sum ${itemsSumCents} != gross ${grossCents}`,
      });
      continue;
    }
    if (grossCents - discountCents !== nettCents) {
      warnings.push(
        `${invoice}: gross ${grossCents} - discount ${discountCents} != nett ${nettCents}; using nett as total`
      );
    }

    const unmapped = parsedItems.filter(({ parsed }) => !parsed.catalogItemId);
    if (unmapped.length > 0) {
      errors.push({
        invoice,
        error: `unmapped catalog items: ${unmapped
          .map(({ parsed }) => parsed.rawName)
          .join(', ')}`,
      });
      continue;
    }

    const orderNumber = `LEG-${invoice.replace(/^#/, '')}`;

    orders.push({
      legacy: {
        invoice,
        systemId,
        orderGroup: group,
        outlet: (row['Cashier'] ?? LEGACY_OUTLET).trim(),
        date: row['Date'],
        time: row['Time'],
      },
      order: {
        order_number: orderNumber,
        display_code: invoice,
        status: 'delivered',
        source: channel,
        delivery_type: channel === 'counter' ? 'self_pickup' : 'delivery',
        fulfillment_type: 'asap',
        subtotal_cents: grossCents,
        discount_cents: discountCents,
        delivery_fee_cents: 0,
        total_cents: nettCents,
        customer_id: null,
        customer_name: channel === 'counter' ? 'Walk-in' : null,
        notes: remarks || null,
        include_cutlery: cutlery ?? true,
        created_at: placedAtIso,
        updated_at: placedAtIso,
      },
      items: parsedItems.map(({ parsed }) => ({
        menu_item_id: parsed.catalogItemId,
        menu_item_name: parsed.displayName,
        menu_item_price_cents: parsed.unitPriceCents,
        quantity: parsed.quantity,
        line_total_cents: parsed.lineTotalCents,
        notes: parsed.notes || null,
      })),
      payment: {
        method,
        amount_cents: nettCents,
        paid_at: placedAtIso,
        external_ref: systemId || null,
      },
      channelOrder: {
        channel: channel === 'counter' ? 'legacy_pos' : channel,
        external_order_id: systemId,
        external_order_number:
          externalOrderNumber ?? (channel === 'counter' ? invoice : null),
        external_store_id: (row['Cashier'] ?? LEGACY_OUTLET).trim(),
        external_status: row['Payment Status'],
      },
      rawOrder: row,
      rawItems,
    });
  }

  const refundModels = refunds.map(({ refundRow, originalRow, amountCents, refundedAtIso, strategy }) => ({
    linkedInvoice: (originalRow['Invoice No'] ?? '').trim(),
    linkedSystemId: String(originalRow['System ID'] ?? '').trim(),
    invoice: (refundRow['Invoice No'] ?? '').trim(),
    systemId: String(refundRow['System ID'] ?? '').trim(),
    amountCents,
    refundedAtIso,
    method: mapPaymentMethod(originalRow),
    reason: `Legacy refund (${(refundRow['Invoice No'] ?? '').trim()}, matched by ${strategy})`,
    raw: refundRow,
  }));

  for (const neg of unmatchedRefunds) {
    warnings.push(
      `unmatched refund record: ${(neg['Invoice No'] ?? '').trim()} (${neg['Total Gross Sales']})`
    );
  }

  // Attach each refund to the order it reverses (the RPC writes refunds
  // atomically together with that order).
  const refundsByInvoice = new Map();
  for (const r of refundModels) {
    if (!refundsByInvoice.has(r.linkedInvoice)) refundsByInvoice.set(r.linkedInvoice, []);
    refundsByInvoice.get(r.linkedInvoice).push(r);
  }
  for (const o of orders) {
    o.refunds = refundsByInvoice.get(o.legacy.invoice) ?? [];
  }

  // --- stats for the reconciliation report ---
  const perChannel = {};
  for (const o of orders) {
    const key = o.order.source;
    perChannel[key] ??= { orders: 0, grossCents: 0, discountCents: 0, nettCents: 0 };
    perChannel[key].orders += 1;
    perChannel[key].grossCents += o.order.subtotal_cents;
    perChannel[key].discountCents += o.order.discount_cents;
    perChannel[key].nettCents += o.order.total_cents;
  }
  const stats = {
    totalRows: rows.length,
    orderRows: orderRows.length,
    itemRows: itemRows.length,
    importedOrders: orders.length,
    errorOrders: errors.length,
    refunds: refundModels.length,
    perChannel,
    totalGrossCents: orders.reduce((a, o) => a + o.order.subtotal_cents, 0),
    totalDiscountCents: orders.reduce((a, o) => a + o.order.discount_cents, 0),
    totalNettCents: orders.reduce((a, o) => a + o.order.total_cents, 0),
    refundCents: refundModels.reduce((a, r) => a + r.amountCents, 0),
  };

  return { orders, refunds: refundModels, warnings, errors, stats };
}
