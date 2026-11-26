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
import { LOGO_RASTER } from './logo-raster'
import { formatStorePhone, includedTaxCents } from './store-settings'

export interface PrintOrderItem {
  name: string
  quantity: number
  modifiers?: { name: string; quantity: number }[]
  notes?: string
  priceCents: number
  lineTotalCents?: number | null
}

export interface PrintOrder {
  orderNumber: string
  /** MK-NNN short code the customer and kitchen already read out loud. */
  displayCode?: string
  /** counter | grabfood | web | ... (orders.source) */
  source: string
  status?: string | null
  deliveryType?: string | null
  /** Grab's short order number (GF-xxx) when source is grabfood. */
  externalOrderNumber?: string
  createdAt: string
  customerName?: string | null
  orderNotes?: string | null
  items: PrintOrderItem[]
  subtotalCents: number
  deliveryFeeCents?: number | null
  discountCents?: number | null
  totalCents: number
  hasSucceededPayment?: boolean
  paymentMethod?: string | null
  /** Saved order payment snapshot, for display when no succeeded payment exists. */
  snapshotPaymentMethod?: string | null
  /**
   * True when the diner's own "I've paid" tap recorded this payment.
   *
   * The server cannot see the bank transfer, so the receipt has to tell the
   * cashier to verify it — without this, a self-declared claim is printed
   * like any other QR payment and the meal is served for free.
   */
  paymentClaimedByDiner?: boolean
  /** Dine-in/takeaway label for counter orders. */
  fulfillmentLabel?: string
  /** Dine-in table label snapshot (e.g. "T3"). */
  tableLabel?: string | null
  /** Dine-in party size. */
  pax?: number | null
}

export type PrintJobType = 'kitchen_docket' | 'receipt' | 'grabfood_ticket'

/** The identity printed on the receipt header, editable in /admin/settings. */
export interface PrintStore {
  /** Branch name on paper, e.g. "Mad Krapow Subang Permai". */
  storeName: string
  address: string
  phone: string
  companyName: string
  companyRegistration: string
  /** Free-text line at the foot of the receipt; empty hides it. */
  footer: string
  /** SST percentage already included in menu prices; 0 hides the tax row. */
  taxRatePercent: number
}

export type PrintLine =
  | { kind: 'text'; text: string; style?: { align?: 'left' | 'center' | 'right'; bold?: boolean; double?: boolean } }
  | { kind: 'divider' }
  | { kind: 'columns'; label: string; value: string; bold?: boolean }
  | { kind: 'blank' }
  /** The store logo, rendered as a raster on ESC/POS and an image in HTML. */
  | { kind: 'logo' }

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
  // Slice off the milliseconds only (19 chars keeps YYYY-MM-DD HH:MM:SS;
  // 17 would drop the seconds and leave a dangling colon).
  return new Date(new Date(iso).getTime() + 8 * 3600_000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19)
}

/**
 * GrabFood and the POS pack several remarks into one notes string separated by
 * " | ". Staff read the docket top to bottom, so each remark gets its own line
 * instead of one long row that wraps in the middle of an addon.
 */
function splitNotes(notes: string | undefined): string[] {
  if (!notes) return []
  return notes
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
}

function itemLines(order: PrintOrder, withPrices: boolean): PrintLine[] {
  const lines: PrintLine[] = []
  for (const item of order.items) {
    const qty = `${item.quantity}x`
    lines.push(
      withPrices
        ? { kind: 'columns', label: `${qty} ${item.name}`, value: formatCents(item.lineTotalCents ?? item.priceCents * item.quantity) }
        : { kind: 'text', text: `${qty} ${item.name}`, style: { bold: true } }
    )
    for (const modifier of item.modifiers ?? []) {
      lines.push({ kind: 'text', text: `   + ${modifier.quantity > 1 ? `${modifier.quantity}x ` : ''}${modifier.name}` })
    }
    for (const note of splitNotes(item.notes)) {
      lines.push({ kind: 'text', text: `   ! ${note}`, style: { bold: true } })
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
  const shortNumber = order.externalOrderNumber?.trim()
  const shortCode = order.displayCode?.trim()
  lines.push({ kind: 'text', text: shortNumber || shortCode || order.orderNumber, style: { align: 'center', bold: true, double: true } })
  if (shortNumber && shortCode) {
    lines.push({ kind: 'text', text: shortCode, style: { align: 'center', bold: true, double: true } })
  }
  lines.push({ kind: 'text', text: timestamp(order.createdAt), style: { align: 'center' } })
  if (order.tableLabel) {
    lines.push({
      kind: 'text',
      text: `TABLE ${order.tableLabel}${order.pax ? ` · ${order.pax} PAX` : ''}`,
      style: { align: 'center', bold: true },
    })
  }
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
  lines.push({ kind: 'text', text: order.externalOrderNumber?.trim() || order.displayCode?.trim() || order.orderNumber, style: { align: 'center', bold: true } })
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

/**
 * Customer receipt, laid out top to bottom:
 *
 *   logo → store name → address → company (registration) → phone → rule
 *   → [REPRINT / CANCELLED] → Grab number and MK-NNN short code (large, bold)
 *   → date → channel
 *   → fulfilment → customer → rule → items → rule
 *   → subtotal → discount → delivery → SST (included) → TOTAL → payment
 *   → warnings → footer
 *
 * The store identity comes from `store_settings`, so a branch rename or a new
 * company registration number never needs a deploy. Money is display-only:
 * every figure is the saved value on the order, never recomputed here.
 */
export function buildReceipt(
  order: PrintOrder,
  store: PrintStore,
  options: { reprint?: boolean } = {}
): PrintJob {
  const lines: PrintLine[] = []
  lines.push({ kind: 'logo' })
  lines.push({ kind: 'text', text: store.storeName, style: { align: 'center', bold: true } })
  if (store.address) {
    lines.push({ kind: 'text', text: store.address, style: { align: 'center' } })
  }
  const company = store.companyRegistration
    ? `${store.companyName} (${store.companyRegistration})`
    : store.companyName
  if (company) {
    lines.push({ kind: 'text', text: company, style: { align: 'center' } })
  }
  if (store.phone) {
    lines.push({ kind: 'text', text: formatStorePhone(store.phone), style: { align: 'center' } })
  }
  lines.push({ kind: 'divider' })

  // Only a copy is labelled: the first print is the original and says nothing.
  if (order.status === 'cancelled') {
    lines.push({ kind: 'text', text: '** CANCELLED - VOID **', style: { align: 'center', bold: true, double: true } })
  }
  if (options.reprint) {
    lines.push({ kind: 'text', text: '** REPRINT **', style: { align: 'center', bold: true } })
  }

  // The order number is what staff and customers read out loud — give it the
  // largest type the printer has. A Grab order shows both codes: the rider
  // quotes GF-xxxx and the shop quotes MK-NNN.
  const grabRef = order.externalOrderNumber?.trim()
  const shortCode = order.displayCode?.trim()
  if (grabRef) {
    lines.push({ kind: 'text', text: grabRef, style: { align: 'center', bold: true, double: true } })
  }
  if (shortCode) {
    lines.push({ kind: 'text', text: shortCode, style: { align: 'center', bold: true, double: true } })
  }
  if (!grabRef && !shortCode) {
    lines.push({ kind: 'text', text: order.orderNumber, style: { align: 'center', bold: true, double: true } })
  }
  lines.push({ kind: 'columns', label: 'Date', value: timestamp(order.createdAt).trim() })
  lines.push({ kind: 'columns', label: 'Channel', value: SOURCE_LABELS[order.source] ?? order.source.toUpperCase() })
  if (order.fulfillmentLabel) {
    lines.push({ kind: 'columns', label: 'Type', value: order.fulfillmentLabel })
  }
  if (order.tableLabel) {
    lines.push({ kind: 'columns', label: 'Table', value: order.tableLabel })
  }
  if (order.pax != null) {
    lines.push({ kind: 'columns', label: 'Pax', value: String(order.pax) })
  }
  if (order.customerName) {
    lines.push({ kind: 'columns', label: 'Customer', value: order.customerName })
  }
  lines.push({ kind: 'divider' })
  lines.push(...itemLines(order, true))
  lines.push({ kind: 'divider' })

  lines.push({ kind: 'columns', label: 'Subtotal', value: formatCents(order.subtotalCents) })
  if (order.discountCents) {
    lines.push({ kind: 'columns', label: 'Discount', value: formatCents(-order.discountCents) })
  }
  if (order.deliveryFeeCents) {
    lines.push({ kind: 'columns', label: 'Delivery', value: formatCents(order.deliveryFeeCents) })
  }
  // SST is already inside the menu prices, so this row reports the tax
  // contained in the taxable base (subtotal less discount, excluding delivery)
  // rather than adding a charge — TOTAL stays the saved total.
  const taxableBase = Math.max(0, order.subtotalCents - (order.discountCents ?? 0))
  const taxCents = includedTaxCents(taxableBase, store.taxRatePercent)
  if (taxCents > 0) {
    lines.push({
      kind: 'columns',
      label: `SST ${formatRate(store.taxRatePercent)}% (included)`,
      value: formatCents(taxCents),
    })
  }
  lines.push({ kind: 'columns', label: 'TOTAL', value: formatCents(order.totalCents), bold: true })
  const paymentMethod = order.paymentMethod ?? order.snapshotPaymentMethod
  if (paymentMethod) {
    lines.push({ kind: 'columns', label: 'Payment', value: paymentMethod.toUpperCase() })
  }
  if (order.status === 'pending' && !order.hasSucceededPayment) {
    lines.push({ kind: 'text', text: '** PAYMENT NOT CONFIRMED **', style: { align: 'center', bold: true } })
  }
  if (order.paymentClaimedByDiner) {
    // The claim is self-declared: the diner said they paid, the server never
    // saw the transfer. Whoever hands the food over has to check the bank.
    lines.push({ kind: 'text', text: '** CLAIMED BY CUSTOMER - VERIFY TRANSFER **', style: { align: 'center', bold: true } })
  }
  lines.push({ kind: 'blank' })
  if (store.footer) {
    lines.push({ kind: 'text', text: store.footer, style: { align: 'center' } })
  }
  lines.push({ kind: 'blank' }, { kind: 'blank' })
  return { type: 'receipt', lines }
}

/** 6 -> "6", 6.5 -> "6.5" — the SST label reads naturally either way. */
function formatRate(percent: number): string {
  return String(Math.round(percent * 100) / 100)
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
      case 'logo':
        builder.image(LOGO_RASTER)
        break
    }
  }
  builder.feed(3).cut()
  if (options.cashDrawer) {
    builder.openCashDrawer()
  }
  return builder.toUint8Array()
}
