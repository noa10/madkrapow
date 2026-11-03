import { describe, it, expect } from 'vitest'
import {
  buildKitchenDocket,
  buildGrabfoodTicket,
  buildReceipt,
  renderJob,
  formatCents,
} from '../jobs'
import type { PrintOrder } from '../jobs'

const ORDER: PrintOrder = {
  orderNumber: 'MKTEST1234',
  source: 'grabfood',
  externalOrderNumber: 'GF-659',
  createdAt: '2026-10-11T02:00:00Z',
  customerName: 'Amirah',
  orderNotes: 'No cutlery please',
  items: [
    {
      name: 'Set Krapow Daging',
      quantity: 2,
      priceCents: 1300,
      modifiers: [{ name: 'Extra spicy', quantity: 1 }],
      notes: 'less rice',
    },
    { name: 'Teh Ais', quantity: 1, priceCents: 350 },
  ],
  subtotalCents: 2950,
  totalCents: 2950,
  paymentMethod: 'grabfood',
}

const STORE = { name: 'Mad Krapow', address: '123 Thai Food Street, Shah Alam', phone: '+60123456789' }

describe('formatCents', () => {
  it('formats sen amounts and negatives', () => {
    expect(formatCents(1250)).toBe('RM 12.50')
    expect(formatCents(5)).toBe('RM 0.05')
    expect(formatCents(-300)).toBe('-RM 3.00')
  })
})

describe('buildKitchenDocket', () => {
  const job = buildKitchenDocket(ORDER)

  it('has no prices (kitchen does not need money)', () => {
    const text = JSON.stringify(job.lines)
    expect(text).not.toContain('RM 29.50')
  })

  it('leads with source, big order number and item quantities', () => {
    expect(job.lines[0]).toEqual({ kind: 'text', text: 'GRABFOOD', style: { align: 'center' } })
    expect(job.lines[1]).toMatchObject({ text: 'GF-659', style: { align: 'center', bold: true, double: true } })
    const itemLine = job.lines.find((l) => l.kind === 'text' && l.text === '2x Set Krapow Daging')
    expect(itemLine).toBeTruthy()
  })

  it('falls back to the internal number when the short number is missing', () => {
    const job = buildKitchenDocket({ ...ORDER, externalOrderNumber: undefined })
    expect(job.lines[1]).toMatchObject({ text: 'MKTEST1234' })
  })

  it('falls back to the internal number when the short number is blank', () => {
    const job = buildKitchenDocket({ ...ORDER, externalOrderNumber: '   ' })
    expect(job.lines[1]).toMatchObject({ text: 'MKTEST1234' })
  })

  it('indents modifiers and flags item notes', () => {
    const modifier = job.lines.find((l) => l.kind === 'text' && l.text === '   + Extra spicy')
    const note = job.lines.find((l) => l.kind === 'text' && l.text === '   ! less rice')
    expect(modifier).toBeTruthy()
    expect(note).toBeTruthy()
  })

  it('stamps a REPRINT watermark when reprinting', () => {
    const job = buildKitchenDocket(ORDER, { reprint: true })
    expect(job.lines[0]).toMatchObject({ text: '** REPRINT **' })
  })
})

describe('buildGrabfoodTicket', () => {
  it('uses the Grab short order number as the headline', () => {
    const job = buildGrabfoodTicket(ORDER)
    expect(job.lines[0]).toMatchObject({ text: 'GRABFOOD ORDER' })
    expect(job.lines[1]).toMatchObject({ text: 'GF-659' })
  })

  it('falls back to the internal number when the short number is blank', () => {
    const job = buildGrabfoodTicket({ ...ORDER, externalOrderNumber: '  ' })
    expect(job.lines[1]).toMatchObject({ text: 'MKTEST1234' })
  })
})

describe('buildReceipt', () => {
  it('contains the store header, item money rows and totals', () => {
    const job = buildReceipt(ORDER, STORE)
    const texts = job.lines.map((l) => (l.kind === 'text' ? l.text : l.kind === 'columns' ? `${l.label}|${l.value}` : l.kind))
    expect(texts).toContain('Mad Krapow')
    expect(texts).toContain('2x Set Krapow Daging|RM 26.00')
    expect(texts).toContain('1x Teh Ais|RM 3.50')
    expect(texts).toContain('Subtotal|RM 29.50')
    expect(texts).toContain('TOTAL|RM 29.50')
    expect(texts).toContain('Payment|GRABFOOD')
  })

  it('prints the Grab short number as the Grab ref', () => {
    const job = buildReceipt(ORDER, STORE)
    const texts = job.lines.map((l) => (l.kind === 'columns' ? `${l.label}|${l.value}` : l.kind))
    expect(texts).toContain('Grab ref|GF-659')
  })

  it('skips a whitespace-only Grab ref', () => {
    const job = buildReceipt({ ...ORDER, externalOrderNumber: '   ' }, STORE)
    const texts = job.lines.map((l) => (l.kind === 'columns' ? `${l.label}|${l.value}` : l.kind))
    expect(texts.some((text) => String(text).startsWith('Grab ref|'))).toBe(false)
  })

  it('flags a diner-claimed QR payment for the cashier', () => {
    // The claim is self-declared: the server never saw the transfer. The
    // printed receipt is the cashier's only signal that it still needs
    // verifying — without it the meal is handed over for free.
    const job = buildReceipt(
      { ...ORDER, paymentMethod: 'qr_pay', paymentClaimedByDiner: true },
      STORE
    )
    const texts = job.lines.map((l) =>
      l.kind === 'text'
        ? l.text
        : l.kind === 'columns'
          ? `${l.label}|${l.value}`
          : l.kind
    )
    expect(texts).toContain('Payment|QR_PAY')
    expect(texts).toContain('** CLAIMED BY CUSTOMER - VERIFY TRANSFER **')
  })

  it('does not flag a cashier-confirmed QR payment', () => {
    const job = buildReceipt(
      { ...ORDER, paymentMethod: 'qr_pay', paymentClaimedByDiner: false },
      STORE
    )
    expect(JSON.stringify(job.lines)).not.toContain('CLAIMED BY CUSTOMER')
  })
})

describe('dine-in tickets', () => {
  const DINE_IN: PrintOrder = {
    ...ORDER,
    source: 'web',
    externalOrderNumber: undefined,
    paymentMethod: 'cash',
    fulfillmentLabel: 'Dine In',
    tableLabel: 'T3',
    pax: 4,
  }

  const textsOf = (job: ReturnType<typeof buildKitchenDocket>) =>
    job.lines.map((line) =>
      line.kind === 'text'
        ? line.text
        : line.kind === 'columns'
          ? `${line.label}|${line.value}`
          : line.kind
    )

  it('prints the table and pax prominently on the kitchen docket', () => {
    expect(textsOf(buildKitchenDocket(DINE_IN))).toContain('TABLE T3 · 4 PAX')
  })

  it('prints the table, pax and dine-in type on the receipt', () => {
    const texts = textsOf(buildReceipt(DINE_IN, STORE))
    expect(texts).toContain('Type|Dine In')
    expect(texts).toContain('Table|T3')
    expect(texts).toContain('Pax|4')
  })

  it('omits the table line for orders without a table', () => {
    expect(textsOf(buildKitchenDocket(ORDER))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^TABLE /)])
    )
  })
})

describe('renderJob', () => {
  it('produces ESC/POS bytes ending in feed + cut', () => {
    const bytes = Array.from(renderJob(buildKitchenDocket(ORDER)))
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40])
    expect(bytes.slice(-7)).toEqual([0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00])
    expect(bytes.at(-1)).toBe(0x00)
  })

  it('kicks the cash drawer on request (counter cash receipts)', () => {
    const bytes = Array.from(renderJob(buildReceipt(ORDER, STORE), { cashDrawer: true }))
    expect(bytes.slice(-5)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa])
  })

  it('renders every job line kind without throwing', () => {
    const bytes = renderJob(buildReceipt(ORDER, STORE), { charsPerLine: 32 })
    expect(bytes.byteLength).toBeGreaterThan(100)
  })
})

describe('timestamp rendering', () => {
  /** Pull printable ASCII text back out of an ESC/POS byte stream. */
  function printableText(bytes: Uint8Array): string {
    let out = ''
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b === 0x1b || b === 0x1d) {
        i += 2 // skip this command's parameter bytes
        continue
      }
      if (b === 0x0a || (b >= 0x20 && b <= 0x7e)) out += String.fromCharCode(b)
    }
    return out
  }

  // Every docket/receipt prints a creation timestamp in MYT (UTC+8). It used to
  // be sliced to 17 chars, which dropped the seconds and left a dangling colon
  // ("2026-10-14 00:05:") on real paper.
  it('renders MYT timestamps with seconds and no dangling colon', () => {
    const order: PrintOrder = { ...ORDER, createdAt: '2026-10-14T00:05:00.000Z' }
    const text = printableText(renderJob(buildKitchenDocket(order)))

    // The full MYT timestamp must survive to the paper. At the old 17-char
    // slice the text ended "... 08:05:" and this assertion fails.
    expect(text).toContain('2026-10-14 08:05:00')
  })

  it('applies the same MYT rendering on receipts', () => {
    const order: PrintOrder = { ...ORDER, createdAt: '2026-10-14T00:05:00.000Z' }
    const text = printableText(renderJob(buildReceipt(order, STORE)))
    expect(text).toContain('2026-10-14 08:05:00')
  })
})
