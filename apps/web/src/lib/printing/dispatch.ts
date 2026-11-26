/**
 * Which jobs an order prints, and how they render — shared by the claim and
 * render routes so the bridge and manual reprints stay byte-identical.
 *
 * Job matrix (v2):
 * - GrabFood orders print a kitchen docket + customer receipt, exactly like a
 *   counter sale. The GrabFood ticket is only printed on demand.
 * - Counter orders print a kitchen docket + customer receipt. Counter sales
 *   are always paid now; the `pending` branch below remains for legacy
 *   pay-later tickets created before that was removed.
 * - Table-QR dine-in orders print the docket while still unpaid (`pending`,
 *   the kitchen starts immediately) and additionally print a receipt once the
 *   diner claims payment or the POS settles it.
 * - Web orders print the docket + receipt once paid. A pending web order is
 *   an abandoned checkout, not food, so it prints nothing.
 * - Any other source prints a kitchen docket.
 */

import {
  buildKitchenDocket,
  buildGrabfoodTicket,
  buildReceipt,
  renderJob,
} from './jobs'
import type { PrintJobType, PrintOrder } from './jobs'
import {
  DEFAULT_PRINT_STORE_SETTINGS,
  charsPerLineFor,
} from './store-settings'
import type { PrintStoreSettings } from './store-settings'

export const PRINTED_EVENT_PREFIX = 'printed_'

export function jobTypesForOrder(order: {
  source: string
  status?: string | null
  delivery_type?: string | null
}): PrintJobType[] {
  // Grab already pays us, so the counter needs a receipt as much as a counter
  // sale does, and the kitchen needs the same docket. The Grab ticket is a
  // courier slip, not the kitchen's copy — it stays a manual reprint.
  if (order.source === 'grabfood') return ['kitchen_docket', 'receipt']
  if (order.status === 'pending') {
    // The kitchen starts before payment for dine-in and legacy counter
    // tickets. Everything else unpaid — a web checkout in progress — is not
    // an order yet and must never reach paper.
    return order.delivery_type === 'dine_in' || order.source === 'counter'
      ? ['kitchen_docket']
      : []
  }
  return ['kitchen_docket', 'receipt']
}

export function printedMarkerFor(type: PrintJobType): string {
  return `${PRINTED_EVENT_PREFIX}${type}`
}

export interface RenderOptions {
  reprint?: boolean
  charsPerLine?: 32 | 48
  /** Store identity for receipts; defaults to the built-in Mad Krapow block. */
  store?: PrintStoreSettings
}

export function buildJobBytes(
  order: PrintOrder,
  type: PrintJobType,
  options: RenderOptions = {}
): Uint8Array {
  const store = options.store ?? DEFAULT_PRINT_STORE_SETTINGS
  const renderOptions = {
    reprint: options.reprint,
    charsPerLine: options.charsPerLine ?? charsPerLineFor(store.paperWidth),
  }
  const cashDrawer =
    type === 'receipt' &&
    order.paymentMethod === 'cash' &&
    (order.source === 'counter' || Boolean(order.tableLabel))
  switch (type) {
    case 'kitchen_docket':
      return renderJob(buildKitchenDocket(order, renderOptions), renderOptions)
    case 'grabfood_ticket':
      return renderJob(buildGrabfoodTicket(order, renderOptions), renderOptions)
    case 'receipt':
      return renderJob(buildReceipt(order, store, renderOptions), {
        ...renderOptions,
        cashDrawer,
      })
  }
}
