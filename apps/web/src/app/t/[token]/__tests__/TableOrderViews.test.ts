import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  PaymentView,
  ReviewView,
  TableOrderSuccessView,
  type TableOrderViewItem,
} from '../TableOrderViews'
import type { PublicTable, TableOrderSuccess } from '@/lib/pos/types'

/**
 * Renders the table-QR views to static HTML with `react-dom/server`.
 *
 * The repo has no DOM test stack (vitest runs `environment: 'node'`, no
 * testing-library), so this is how the views' real output is asserted rather
 * than only their extracted helpers.
 */

const TABLE: PublicTable = {
  id: 'table-1',
  token: 't'.repeat(32),
  label: 'T3',
  zone: 'Indoor',
  seats: 4,
}

const ITEM: TableOrderViewItem = {
  key: 'item-1||',
  menuItemId: 'item-1',
  name: 'Pad Kra Pao',
  quantity: 2,
  lineTotalCents: 2500,
  modifiers: [{ id: 'm1', name: 'Extra egg', priceDeltaCents: 100 }],
  notes: 'Less spicy',
}

const SUCCESS_PAID: TableOrderSuccess = {
  order_id: '11111111-1111-4111-8111-111111111111',
  order_number: 'MKTEST1234',
  display_code: 'MK-001',
  total_cents: 2600,
  table_label: 'T3',
  pax: 2,
  status: 'paid',
  paid_at: '2026-10-28T10:00:00.000Z',
}

function reviewMarkup(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(ReviewView, {
      table: TABLE,
      items: [ITEM],
      pax: null,
      subtotalCents: 2500,
      customerName: '',
      notes: '',
      paymentChoice: 'counter',
      submitting: false,
      error: null,
      onBack: () => {},
      onChangePax: () => {},
      onCustomerNameChange: () => {},
      onNotesChange: () => {},
      onPaymentChoiceChange: () => {},
      onUpdateQuantity: () => {},
      onRemoveItem: () => {},
      onSubmit: () => {},
      ...overrides,
    })
  )
}

describe('ReviewView', () => {
  it('disables the CTA and asks for diners while pax is unset', () => {
    const html = reviewMarkup()
    expect(html).toContain('Select the number of diners')
    expect(html).toContain('Pax (required)')
    expect(html).toMatch(/disabled=""/)
  })

  it('enables the CTA once pax is set', () => {
    const html = reviewMarkup({ pax: 2 })
    expect(html).not.toContain('Select the number of diners')
    expect(html).not.toMatch(/disabled=""/)
  })

  it('shows both payment choices with the current one selected', () => {
    const html = reviewMarkup({ pax: 2 })
    expect(html).toContain('Pay now by QR')
    expect(html).toContain('Pay at counter')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('switches the CTA label with the payment choice', () => {
    expect(reviewMarkup({ pax: 2, paymentChoice: 'qr' })).toContain(
      'Continue to payment'
    )
    expect(reviewMarkup({ pax: 2, paymentChoice: 'counter' })).toContain(
      'Send order'
    )
  })

  it('lists the cart line with its modifiers and line total', () => {
    const html = reviewMarkup({ pax: 2 })
    expect(html).toContain('Pad Kra Pao')
    expect(html).toContain('Extra egg')
    expect(html).toContain('RM 25.00')
    expect(html).toContain('Less spicy')
  })

  it('shows a submit error inline', () => {
    const html = reviewMarkup({ pax: 2, error: 'Krapow is sold out' })
    expect(html).toContain('Krapow is sold out')
  })
})

describe('PaymentView', () => {
  it('renders the server amount, the diner instruction and the claim CTA', () => {
    const html = renderToStaticMarkup(
      createElement(PaymentView, {
        table: TABLE,
        success: { ...SUCCESS_PAID, status: 'pending' },
        claiming: false,
        error: null,
        onBack: () => {},
        onClaim: () => {},
        onPayAtCounter: () => {},
      })
    )
    expect(html).toContain('RM 26.00')
    expect(html).toContain('Scan with any Malaysian banking app')
    expect(html).toContain('I have paid')
  })

  it('disables the claim CTA while the claim is in flight', () => {
    const html = renderToStaticMarkup(
      createElement(PaymentView, {
        table: TABLE,
        success: { ...SUCCESS_PAID, status: 'pending' },
        claiming: true,
        error: null,
        onBack: () => {},
        onClaim: () => {},
        onPayAtCounter: () => {},
      })
    )
    expect(html).toMatch(/disabled=""/)
  })

  it('offers the pay-at-counter fallback when the claim fails', () => {
    const html = renderToStaticMarkup(
      createElement(PaymentView, {
        table: TABLE,
        success: { ...SUCCESS_PAID, status: 'pending' },
        claiming: false,
        error: 'This order can no longer be paid online.',
        onBack: () => {},
        onClaim: () => {},
        onPayAtCounter: () => {},
      })
    )
    expect(html).toContain('This order can no longer be paid online.')
    expect(html).toContain('Pay at the counter instead')
  })
})

describe('TableOrderSuccessView', () => {
  it('renders a paid state with the receipt link', () => {
    const html = renderToStaticMarkup(
      createElement(TableOrderSuccessView, {
        table: TABLE,
        success: SUCCESS_PAID,
        onOrderMore: () => {},
      })
    )
    expect(html).toContain('Payment received')
    expect(html).toContain('/receipt/')
    expect(html).toContain('MK-001')
  })

  it('renders the pay-at-counter state for a pending order, with its receipt', () => {
    const html = renderToStaticMarkup(
      createElement(TableOrderSuccessView, {
        table: TABLE,
        success: { ...SUCCESS_PAID, status: 'pending', paid_at: null },
        onOrderMore: () => {},
      })
    )
    expect(html).toContain('Pay at the counter')
    // The pending receipt renders PAY AT COUNTER, so the cashier can reconcile
    // the ticket before the diner pays.
    expect(html).toContain('/receipt/')
  })
})

describe('PaymentView claim states', () => {
  it('renders the claim error and keeps both actions enabled', () => {
    const html = renderToStaticMarkup(
      createElement(PaymentView, {
        table: TABLE,
        success: { ...SUCCESS_PAID, status: 'pending' },
        claiming: false,
        error: 'Network error — the payment may already be recorded.',
        onBack: () => {},
        onClaim: () => {},
        onPayAtCounter: () => {},
      })
    )
    expect(html).toContain('the payment may already be recorded')
    expect(html).toContain('I have paid')
    expect(html).toContain('Pay at the counter instead')
    expect(html).not.toMatch(/disabled=""/)
  })
})
