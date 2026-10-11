/**
 * Print job builders — Hubbo's "args → renderable job" pattern applied to the
 * canonical MadKrapow order. Builders produce a declarative line model
 * (testable without bytes); renderJob() turns it into ESC/POS via EscPosBuilder.
 *
 * Jobs: kitchen docket (no prices, grouped qty), customer receipt (full
 * money), GrabFood ticket (Grab short number + pickup framing). A reprint
 * flag stamps a REPRINT watermark, mirroring Hubbo's docket reprint title.
 */

import { EscPosBuilder, CHARS_PER_LINE } from './escpos'
import type { CharsPerLine } from './escpos'

export interface PrintOrderItem {
  name: string
  quantity: number
  modifiers?: { name: string; quantity: number }[]
  notes?: string
  priceCents: number
}

export interface PrintOrder {
  orderNumber: string
  /** counter | grabfood | web | ... (orders.source) */
  source: string
  /** Grab's short order number (GF-xxx) when source is grabfood. */
  externalOrderNumber?: string
  createdAt: string
  customerName?: string | null
  orderNotes?: string | null
  items: PrintOrderItem[]
  subtotalCents: number
  totalCents: number
  paymentMethod?: string | null
  /** Dine-in/takeaway label for counter orders. */
  fulfillmentLabel?: string
}

export type PrintJobType = 'kitchen_docket' | 'receipt' | 'grabfood_ticket'

export type PrintLine =
  | { kind: 'text'; text: string; style?: { align?: 'left' | 'center' | 'right'; bold?: boolean; double?: boolean } }
  | { kind: 'divider' }
  | { kind: 'columns'; label: string; value: string; bold?: boolean }
  | { kind: 'blank' }

export interface PrintJob {
  type: PrintJobType
  lines: PrintLine[]
}

const SOURCE_LABELS: Record<string, string> = {
  counter: 'COUNTER',
  grabfood: 'GRABFOOD',
  web: 'WEB',
}

export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const remainder = String(abs % 100).padStart(2, '0')
  return `${negative ? '-' : ''}RM ${whole}.${remainder}`
}

function timestamp(iso: string): string {
  // MYT (UTC+8) — the restaurant's local clock, regardless of server TZ.
  return new Date(new Date(iso).getTime() + 8 * 3600_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 17)
}

function itemLines(order: PrintOrder, withPrices: boolean): PrintLine[] {
  const lines: PrintLine[] = []
  for (const item of order.items) {
    const qty = `${item.quantity}x`
    lines.push(
      withPrices
        ? { kind: 'columns', label: `${qty} ${item.name}`, value: formatCents(item.priceCents * item.quantity) }
        : { kind: 'text', text: `${qty} ${item.name}`, style: { bold: true } }
    )
    for (const modifier of item.modifiers ?? []) {
      lines.push({ kind: 'text', text: `   + ${modifier.quantity > 1 ? `${modifier.quantity}x ` : ''}${modifier.name}` })
    }
    if (item.notes) {
      lines.push({ kind: 'text', text: `   ! ${item.notes}`, style: { bold: true } })
    }
  }
  return lines
}

export function buildKitchenDocket(order: PrintOrder, options: { reprint?: boolean } = {}): PrintJob {
  const lines: PrintLine[] = []
  if (options.reprint) {
    lines.push({ kind: 'text', text: '** REPRINT **', style: { align: 'center', bold: true } })
  }
  lines.push({ kind: 'text', text: SOURCE_LABELS[order.source] ?? order.source.toUpperCase(), style: { align: 'center' } })
  lines.push({ kind: 'text', text: order.orderNumber, style: { align: 'center', bold: true, double: true } })
  if (order.externalOrderNumber) {
    lines.push({ kind: 'text', text: `Grab: ${order.externalOrderNumber}`, style: { align: 'center' } })
  }
  lines.push({ kind: 'text', text: timestamp(order.createdAt), style: { align: 'center' } })
  lines.push({ kind: 'divider' })
  lines.push(...itemLines(order, false))
  lines.push({ kind: 'divider' })
  const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0)
  lines.push({ kind: 'columns', label: 'Total items', value: String(totalItems) })
  if (order.orderNotes) {
    lines.push({ kind: 'text', text: `NOTE: ${order.orderNotes}`, style: { bold: true } })
  }
  lines.push({ kind: 'blank' }, { kind: 'blank' })
  return { type: 'kitchen_docket', lines }
}

export function buildGrabfoodTicket(order: PrintOrder, options: { reprint?: boolean } = {}): PrintJob {
  const lines: PrintLine[] = []
  if (options.reprint) {
    lines.push({ kind: 'text', text: '** REPRINT **', style: { align: 'center', bold: true } })
  }
  lines.push({ kind: 'text', text: 'GRABFOOD ORDER', style: { align: 'center', bold: true, double: true } })
  lines.push({ kind: 'text', text: order.externalOrderNumber ?? order.orderNumber, style: { align: 'center', bold: true } })
  lines.push({ kind: 'text', text: timestamp(order.createdAt), style: { align: 'center' } })
  if (order.customerName) {
    lines.push({ kind: 'text', text: `Eater: ${order.customerName}` })
  }
  lines.push({ kind: 'divider' })
  lines.push(...itemLines(order, false))
  lines.push({ kind: 'divider' })
  lines.push({ kind: 'text', text: 'Prepare for Grab driver pickup', style: { bold: true } })
  if (order.orderNotes) {
    lines.push({ kind: 'text', text: `NOTE: ${order.orderNotes}`, style: { bold: true } })
  }
  lines.push({ kind: 'blank' }, { kind: 'blank' })
  return { type: 'grabfood_ticket', lines }
}

export function buildReceipt(
  order: PrintOrder,
  store: { name: string; address: string; phone: string },
  options: { reprint?: boolean } = {}
): PrintJob {
  const lines: PrintLine[] = []
  lines.push({ kind: 'text', text: store.name, style: { align: 'center', bold: true } })
  lines.push({ kind: 'text', text: store.address, style: { align: 'center' } })
  lines.push({ kind: 'text', text: store.phone, style: { align: 'center' } })
  lines.push({ kind: 'divider' })
  if (options.reprint) {
    lines.push({ kind: 'text', text: '** REPRINT **', style: { align: 'center', bold: true } })
  }
  lines.push({ kind: 'columns', label: 'Order', value: order.orderNumber })
  if (order.externalOrderNumber) {
    lines.push({ kind: 'columns', label: 'Grab ref', value: order.externalOrderNumber })
  }
  lines.push({ kind: 'columns', label: 'Date', value: timestamp(order.createdAt).trim() })
  lines.push({ kind: 'columns', label: 'Channel', value: SOURCE_LABELS[order.source] ?? order.source.toUpperCase() })
  if (order.fulfillmentLabel) {
    lines.push({ kind: 'columns', label: 'Type', value: order.fulfillmentLabel })
  }
  if (order.customerName) {
    lines.push({ kind: 'columns', label: 'Customer', value: order.customerName })
  }
  lines.push({ kind: 'divider' })
  lines.push(...itemLines(order, true))
  lines.push({ kind: 'divider' })
  lines.push({ kind: 'columns', label: 'Subtotal', value: formatCents(order.subtotalCents) })
  lines.push({ kind: 'columns', label: 'TOTAL', value: formatCents(order.totalCents), bold: true })
  if (order.paymentMethod) {
    lines.push({ kind: 'columns', label: 'Payment', value: order.paymentMethod.toUpperCase() })
  }
  lines.push({ kind: 'blank' })
  lines.push({ kind: 'text', text: 'Powered by Mad Krapow', style: { align: 'center' } })
  lines.push({ kind: 'blank' }, { kind: 'blank' })
  return { type: 'receipt', lines }
}

/** Render a job's line model into ESC/POS bytes. */
export function renderJob(
  job: PrintJob,
  options: { charsPerLine?: CharsPerLine; cashDrawer?: boolean } = {}
): Uint8Array {
  const builder = new EscPosBuilder(options.charsPerLine ?? CHARS_PER_LINE.W80)
  for (const line of job.lines) {
    switch (line.kind) {
      case 'text':
        builder.text(line.text, line.style)
        break
      case 'divider':
        builder.divider()
        break
      case 'columns':
        builder.columns(line.label, line.value, { bold: line.bold })
        break
      case 'blank':
        builder.lineFeed(1)
        break
    }
  }
  builder.feed(3).cut()
  if (options.cashDrawer) {
    builder.openCashDrawer()
  }
  return builder.toUint8Array()
}
