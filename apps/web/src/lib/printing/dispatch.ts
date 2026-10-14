/**
 * Which jobs an order prints, and how they render — shared by the claim and
 * render routes so the bridge and manual reprints stay byte-identical.
 *
 * Job matrix (v1): GrabFood orders print a GrabFood ticket; counter orders
 * print a kitchen docket + customer receipt (receipt kicks the cash drawer on
 * cash payments); other sources print a kitchen docket.
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

export function jobTypesForOrder(source: string): PrintJobType[] {
  if (source === 'grabfood') return ['grabfood_ticket']
  if (source === 'counter') return ['kitchen_docket', 'receipt']
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
    type === 'receipt' && order.source === 'counter' && order.paymentMethod === 'cash'
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
