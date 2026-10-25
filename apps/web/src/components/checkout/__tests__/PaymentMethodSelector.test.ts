import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PaymentMethodSelector } from '../PaymentMethodSelector'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payments/methods'

function render(options = PAYMENT_METHOD_OPTIONS, value: 'stripe' | 'billplz' = 'stripe') {
  return renderToStaticMarkup(
    React.createElement(PaymentMethodSelector, {
      options,
      value,
      onChange: vi.fn(),
    }),
  )
}

describe('PaymentMethodSelector', () => {
  it('renders every offered method as a radio card', () => {
    const html = render()

    expect(html).toContain('Card (Stripe)')
    expect(html).toContain('FPX Online Banking (Billplz)')
    expect(html.match(/name="payment-method"/g)).toHaveLength(2)
    expect(html).toContain('value="stripe"')
    expect(html).toContain('value="billplz"')
    expect(html).toContain('role="radiogroup"')
  })

  it('marks the selected method as checked', () => {
    const html = render(PAYMENT_METHOD_OPTIONS, 'billplz')

    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="billplz"/)
  })

  it('shows only the methods the server reports as available', () => {
    const html = render(
      PAYMENT_METHOD_OPTIONS.filter((option) => option.id === 'stripe'),
    )

    expect(html).toContain('Card (Stripe)')
    expect(html).not.toContain('Billplz')
  })
})
