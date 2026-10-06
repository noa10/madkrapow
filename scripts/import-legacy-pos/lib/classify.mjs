// Channel classification and remark parsing for legacy ORDER rows.
//
// The legacy POS books platform orders as paid-at-counter rows:
//   Counter Payment Method "GrabFood"/"FoodPanda" (+ Cashier "<Platform> Robot")
//   → sales channels; "Cash"/"QR Pay" → counter walk-ins.
//
// Remarks carry platform order references:
//   GrabFood:   "GF-659 (cutlery - no)"   → external_order_number + cutlery pref
//   FoodPanda:  "#1995"                   → external_order_number
//   Counter:    empty

/**
 * @param {{'Counter Payment Method'?: string|null, Cashier?: string|null}} order
 * @returns {'grabfood'|'foodpanda'|'counter'}
 */
export function classifyChannel(order) {
  const method = (order['Counter Payment Method'] ?? '').trim();
  if (method === 'GrabFood') return 'grabfood';
  if (method === 'FoodPanda') return 'foodpanda';
  const cashier = (order['Cashier'] ?? '').trim();
  if (/GrabFood/i.test(cashier)) return 'grabfood';
  if (/FoodPanda/i.test(cashier)) return 'foodpanda';
  return 'counter';
}

const PAYMENT_METHOD_MAP = {
  cash: 'cash',
  'qr pay': 'qr_pay',
  grabfood: 'grabfood',
  foodpanda: 'foodpanda',
};

/**
 * @param {{'Counter Payment Method'?: string|null}} order
 * @returns {'cash'|'qr_pay'|'grabfood'|'foodpanda'|'other'}
 */
export function mapPaymentMethod(order) {
  const method = (order['Counter Payment Method'] ?? '').trim().toLowerCase();
  return PAYMENT_METHOD_MAP[method] ?? 'other';
}

/**
 * @param {string|null} remarks
 * @returns {{ externalOrderNumber: string|null, cutlery: boolean|null }}
 */
export function parseRemarks(remarks) {
  const r = (remarks ?? '').trim();
  if (!r) return { externalOrderNumber: null, cutlery: null };

  const gf = /^GF-(\d+)/i.exec(r);
  if (gf) {
    const cutleryMatch = /cutlery\s*-\s*(yes|no)/i.exec(r);
    return {
      externalOrderNumber: `GF-${gf[1]}`,
      cutlery: cutleryMatch ? cutleryMatch[1].toLowerCase() === 'yes' : null,
    };
  }

  const fp = /^#(\d+)/.exec(r);
  if (fp) {
    return { externalOrderNumber: `#${fp[1]}`, cutlery: null };
  }

  return { externalOrderNumber: null, cutlery: null };
}
