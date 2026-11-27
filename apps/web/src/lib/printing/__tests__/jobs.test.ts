import { describe, it, expect } from 'vitest'
import {
  buildKitchenDocket,
  buildGrabfoodTicket,
  buildReceipt,
  renderJob,
  formatCents,
} from '../jobs'
import type { PrintJob, PrintOrder } from '../jobs'

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

const STORE = {
  storeName: 'Mad Krapow',
  address: '123 Thai Food Street, Shah Alam',
  phone: '+60123456789',
  companyName: 'Bakaris Enterprise',
  companyRegistration: '201903057932',
  footer: 'Powered by Mad Krapow',
  taxRatePercent: 6,
}

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

  it('prints only the Grab number for Grab orders', () => {
    const job = buildKitchenDocket({ ...ORDER, displayCode: 'MK-3243' })
    const big = job.lines.flatMap((line) => line.kind === 'text' && line.style?.double ? [line.text] : [])
    expect(big).toEqual(['GF-659'])
    expect(JSON.stringify(job.lines)).not.toContain('MK-3243')
  })

  it('uses the MK code for web orders even when an external number exists', () => {
    const job = buildKitchenDocket({ ...ORDER, source: 'web', displayCode: ' MK-3243 ' })
    const big = job.lines.flatMap((line) => line.kind === 'text' && line.style?.double ? [line.text] : [])
    expect(big).toEqual(['MK-3243'])
    expect(JSON.stringify(job.lines)).not.toContain('GF-659')
  })

  it('falls back to the MK code for Grab orders without a Grab number', () => {
    const job = buildKitchenDocket({ ...ORDER, externalOrderNumber: ' ', displayCode: ' MK-3243 ' })
    expect(job.lines[1]).toMatchObject({ text: 'MK-3243' })
  })

  it('indents modifiers and item notes with asterisks', () => {
    expect(job.lines).toContainEqual({ kind: 'text', text: '   * Extra spicy', style: { indent: 3 } })
    expect(job.lines).toContainEqual({ kind: 'text', text: '   * less rice', style: { bold: true, indent: 3 } })
  })

  it('stamps a REPRINT watermark when reprinting', () => {
    const job = buildKitchenDocket(ORDER, { reprint: true })
    expect(job.lines[0]).toMatchObject({ text: '** REPRINT **' })
  })

  it('puts every pipe-separated remark on its own line', () => {
    const order = {
      ...ORDER,
      items: [
        {
          ...ORDER.items[0],
          notes: 'Tak Pedas | Bekas Makanan (Photodegradable) | 135g | Thai Holy Basil',
        },
      ],
    }
    const job = buildKitchenDocket(order)
    const texts = job.lines.flatMap((l) => (l.kind === 'text' ? [l.text] : []))
    expect(texts).toContain('   * Tak Pedas')
    expect(texts).toContain('   * Bekas Makanan (Photodegradable)')
    expect(texts).toContain('   * 135g')
    expect(texts).toContain('   * Thai Holy Basil')
    expect(texts.some((t) => t.includes('|'))).toBe(false)
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

  it('uses saved item totals and payment snapshots when available', () => {
    const job = buildReceipt({
      ...ORDER,
      items: [{ name: 'Meal', quantity: 2, priceCents: 1000, lineTotalCents: 2500 }],
      paymentMethod: null,
      snapshotPaymentMethod: 'cash',
    }, STORE)
    expect(job.lines).toContainEqual({ kind: 'columns', label: '2x Meal', value: 'RM 25.00' })
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'Payment', value: 'CASH' })
  })

  it('warns when a pending order has no successful payment', () => {
    const job = buildReceipt({ ...ORDER, status: 'pending', paymentMethod: null }, STORE)
    expect(job.lines).toContainEqual(expect.objectContaining({ text: '** PAYMENT NOT CONFIRMED **' }))
  })

  it('shows saved adjustments without changing the saved total', () => {
    const job = buildReceipt({ ...ORDER, subtotalCents: 2500, deliveryFeeCents: 500, discountCents: 300, totalCents: 2700 }, STORE)
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'Delivery', value: 'RM 5.00' })
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'Discount', value: '-RM 3.00' })
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'TOTAL', value: 'RM 27.00', bold: true })
  })

  it('prominently marks cancelled receipts', () => {
    expect(buildReceipt({ ...ORDER, status: 'cancelled' }, STORE).lines).toContainEqual(
      expect.objectContaining({ text: '** CANCELLED - VOID **', style: expect.objectContaining({ bold: true }) })
    )
  })

  it('drops the separate Grab ref row now that the number is the headline', () => {
    const job = buildReceipt(ORDER, STORE)
    const texts = job.lines.map((l) => (l.kind === 'columns' ? `${l.label}|${l.value}` : l.kind))
    expect(texts).not.toContain('Grab ref|GF-659')
  })

  it('falls back to the MK short code when the Grab number is blank', () => {
    const job = buildReceipt({ ...ORDER, externalOrderNumber: '   ', displayCode: 'MK-77' }, STORE)
    const big = job.lines.flatMap((l) => (l.kind === 'text' && l.style?.double ? [l.text] : []))
    expect(big).toEqual(['MK-77'])
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

describe('buildReceipt layout', () => {
  const kinds = (job: { lines: Array<{ kind: string }> }) => job.lines.map((line) => line.kind)
  const texts = (job: { lines: PrintJob['lines'] }) =>
    job.lines.map((line) =>
      line.kind === 'text'
        ? line.text
        : line.kind === 'columns'
          ? `${line.label}|${line.value}`
          : line.kind
    )

  it('leads with the logo, then the store block in the order staff signed off on', () => {
    const job = buildReceipt(ORDER, STORE)
    expect(kinds(job).slice(0, 6)).toEqual(['logo', 'text', 'text', 'text', 'text', 'divider'])
    expect(texts(job).slice(0, 5)).toEqual([
      'logo',
      'Mad Krapow',
      '123 Thai Food Street, Shah Alam',
      'Bakaris Enterprise (201903057932)',
      '+6012-345-6789',
    ])
  })

  it('prints only the Grab number for Grab orders', () => {
    const job = buildReceipt({ ...ORDER, displayCode: 'MK-3243' }, STORE)
    const big = job.lines.flatMap((l) => (l.kind === 'text' && l.style?.double ? [l.text] : []))
    expect(big).toEqual(['GF-659'])
    expect(texts(job)).not.toContain('Order|MKTEST1234')
  })

  it('prints the MK code for other channels even if an external number is present', () => {
    const job = buildReceipt({ ...ORDER, source: 'web', displayCode: ' MK-3243 ' }, STORE)
    const big = job.lines.flatMap((l) => (l.kind === 'text' && l.style?.double ? [l.text] : []))
    expect(big).toEqual(['MK-3243'])
  })

  it('falls back to the internal number for other channels with a blank MK code', () => {
    const job = buildReceipt({ ...ORDER, source: 'counter', displayCode: '  ' }, STORE)
    const big = job.lines.flatMap((l) => (l.kind === 'text' && l.style?.double ? [l.text] : []))
    expect(big).toEqual(['MKTEST1234'])
  })

  it('falls back to the internal number when no short code exists', () => {
    const job = buildReceipt({ ...ORDER, externalOrderNumber: undefined }, STORE)
    expect(job.lines).toContainEqual({
      kind: 'text',
      text: 'MKTEST1234',
      style: { align: 'center', bold: true, double: true },
    })
  })

  it('labels a copy REPRINT and leaves the original unmarked', () => {
    expect(texts(buildReceipt(ORDER, STORE, { reprint: true }))).toContain('** REPRINT **')
    expect(texts(buildReceipt(ORDER, STORE))).not.toContain('** REPRINT **')
  })

  it('reports SST as already included and never inflates the saved total', () => {
    const job = buildReceipt(ORDER, STORE)
    // RM 29.50 inclusive at 6% contains RM 1.67 of tax (2950 * 6 / 106).
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'SST 6% (included)', value: 'RM 1.67' })
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'TOTAL', value: 'RM 29.50', bold: true })
  })

  it('computes the included tax on the discounted taxable base', () => {
    const job = buildReceipt({ ...ORDER, subtotalCents: 2500, discountCents: 300 }, STORE)
    // (2500 - 300) * 6 / 106 = 124.5 -> RM 1.25
    expect(job.lines).toContainEqual({ kind: 'columns', label: 'SST 6% (included)', value: 'RM 1.25' })
  })

  it('hides the SST row when the rate is zero', () => {
    const job = buildReceipt(ORDER, { ...STORE, taxRatePercent: 0 })
    expect(JSON.stringify(job.lines)).not.toContain('SST')
  })

  it('prints the editable footer line, and nothing when it is blank', () => {
    expect(texts(buildReceipt(ORDER, STORE))).toContain('Powered by Mad Krapow')
    expect(texts(buildReceipt(ORDER, { ...STORE, footer: '' }))).not.toContain('Powered by Mad Krapow')
  })

  it('omits the company registration when none is configured', () => {
    const job = buildReceipt(ORDER, { ...STORE, companyRegistration: '' })
    expect(texts(job)).toContain('Bakaris Enterprise')
    expect(texts(job)).not.toContain('Bakaris Enterprise ()')
  })

  it('draws the logo as a GS v 0 raster before the header text', () => {
    const bytes = Array.from(renderJob(buildReceipt(ORDER, STORE)))
    const rasterAt = bytes.findIndex(
      (byte, i) => byte === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30
    )
    expect(rasterAt).toBeGreaterThan(-1)
    // The store name must come after the raster, never before it.
    const nameAt = bytes.indexOf(0x4d) // 'M' of "Mad Krapow"
    expect(nameAt).toBeGreaterThan(rasterAt)
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

  it('prints each addon of a pipe-packed remark on its own line on the receipt', () => {
    const order = {
      ...ORDER,
      items: [{ ...ORDER.items[0], notes: 'Tak Pedas | Bekas Makanan | Thai Holy Basil' }],
    }
    const texts = textsOf(buildReceipt(order, STORE))
    expect(texts).toContain('   * Extra spicy')
    expect(texts).toContain('   * Tak Pedas')
    expect(texts).toContain('   * Bekas Makanan')
    expect(texts).toContain('   * Thai Holy Basil')
    const remarkLines = texts.filter((t) => t.trimStart().startsWith('*'))
    expect(remarkLines.every((t) => !t.includes('|'))).toBe(true)
  })
})

describe('renderJob', () => {
  it('produces ESC/POS bytes ending in feed + cut', () => {
    const bytes = Array.from(renderJob(buildKitchenDocket(ORDER)))
    expect(bytes.slice(0, 2)).toEqual([0x1b, 0x40])
    expect(bytes.slice(-7)).toEqual([0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00])
    expect(bytes.at(-1)).toBe(0x00)
  })

  it('preserves receipt addon indentation in printer bytes at both paper widths', () => {
    const order = {
      ...ORDER,
      items: [{ ...ORDER.items[0], notes: 'A long note that wraps to the next line on narrow receipt paper' }],
    }
    for (const charsPerLine of [32, 48] as const) {
      const bytes = renderJob(buildReceipt(order, STORE), { charsPerLine })
      const text = Buffer.from(bytes).toString('latin1')
      expect(text).toContain('   * Extra spicy\n')
      const noteStart = text.indexOf('   * A long note')
      expect(noteStart).toBeGreaterThan(-1)
      const noteLines = text.slice(noteStart).split('\x1b')[0].trimEnd().split('\n')
      expect(noteLines.length).toBeGreaterThan(1)
      expect(noteLines.every((line) => line.startsWith('   ') && line.length <= charsPerLine)).toBe(true)
    }
  })

  it.each(['grabfood', 'web'])('preserves %s docket detail indentation in printer bytes at both paper widths', (source) => {
    const order = {
      ...ORDER,
      source,
      items: [{ ...ORDER.items[0], notes: 'A long note that wraps to the next line on narrow receipt paper' }],
    }
    for (const charsPerLine of [32, 48] as const) {
      const text = Buffer.from(renderJob(buildKitchenDocket(order), { charsPerLine })).toString('latin1')
      expect(text).toContain('   * Extra spicy\n')
      const noteStart = text.indexOf('   * A long note')
      expect(noteStart).toBeGreaterThan(-1)
      const noteLines = text.slice(noteStart).split('\x1b')[0].trimEnd().split('\n')
      expect(noteLines.length).toBeGreaterThan(1)
      expect(noteLines.every((line) => line.startsWith('   ') && line.length <= charsPerLine)).toBe(true)
    }
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
