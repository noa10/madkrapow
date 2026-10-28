/**
 * Which jobs an order prints, and how they render — shared by the claim and
 * render routes so the bridge and manual reprints stay byte-identical.
 *
 * Job matrix (v1):
 * - GrabFood orders print a GrabFood ticket.
 * - Counter orders print a kitchen docket + customer receipt; a pay-later
 *   counter order prints only the docket until the POS settles it.
 * - Table-QR dine-in orders print the docket while still unpaid (`pending`,
 *   the kitchen starts immediately) and additionally print a receipt once the
 *   POS marks them paid.
 * - Other sources print a kitchen docket.
 */

import {
  buildKitchenDocket,
  buildGrabfoodTicket,
  buildReceipt,
  renderJob,
} from './jobs'
import type { PrintJobType, PrintOrder } from './jobs'
import { env } from '@/lib/validators/env'

export const PRINTED_EVENT_PREFIX = 'printed_'

export function jobTypesForOrder(order: {
  source: string
  status?: string | null
  delivery_type?: string | null
}): PrintJobType[] {
  if (order.source === 'grabfood') return ['grabfood_ticket']
  if (order.source === 'counter') {
    // A pay-later ticket prints the kitchen docket immediately; the receipt
    // waits until the POS settles it (the docket marker dedupes the reprint).
    return order.status === 'pending'
      ? ['kitchen_docket']
      : ['kitchen_docket', 'receipt']
  }
  if (order.delivery_type === 'dine_in') {
    return order.status === 'pending'
      ? ['kitchen_docket']
      : ['kitchen_docket', 'receipt']
  }
  return ['kitchen_docket']
}

export function printedMarkerFor(type: PrintJobType): string {
  return `${PRINTED_EVENT_PREFIX}${type}`
}

export interface RenderOptions {
  reprint?: boolean
  charsPerLine?: 32 | 48
}

export function buildJobBytes(
  order: PrintOrder,
  type: PrintJobType,
  options: RenderOptions = {}
): Uint8Array {
  const cashDrawer =
    type === 'receipt' &&
    order.paymentMethod === 'cash' &&
    (order.source === 'counter' || Boolean(order.tableLabel))
  switch (type) {
    case 'kitchen_docket':
      return renderJob(buildKitchenDocket(order, { reprint: options.reprint }), options)
    case 'grabfood_ticket':
      return renderJob(buildGrabfoodTicket(order, { reprint: options.reprint }), options)
    case 'receipt':
      return renderJob(
        buildReceipt(
          order,
          {
            name: 'Mad Krapow',
            address: env.STORE_ADDRESS ?? '',
            phone: env.STORE_PHONE ?? '',
          },
          { reprint: options.reprint }
        ),
        { ...options, cashDrawer }
      )
  }
}
