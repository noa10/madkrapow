import { describe, expect, it, vi } from 'vitest'

// `dispatch.ts` reads store details from the validated env at call time.
vi.mock('@/lib/validators/env', () => ({
  env: { STORE_ADDRESS: '', STORE_PHONE: '' },
}))

import { jobTypesForOrder } from '../dispatch'

describe('jobTypesForOrder', () => {
  it('prints a GrabFood ticket for Grab orders', () => {
    expect(jobTypesForOrder({ source: 'grabfood', status: 'paid' })).toEqual([
      'grabfood_ticket',
    ])
  })

  it('prints a docket and receipt for counter orders', () => {
    expect(jobTypesForOrder({ source: 'counter', status: 'paid' })).toEqual([
      'kitchen_docket',
      'receipt',
    ])
  })

  it('prints only the docket for a pay-later counter order', () => {
    expect(jobTypesForOrder({ source: 'counter', status: 'pending' })).toEqual([
      'kitchen_docket',
    ])
  })

  it('prints only the docket while a table-QR order is unpaid', () => {
    expect(
      jobTypesForOrder({
        source: 'web',
        status: 'pending',
        delivery_type: 'dine_in',
      })
    ).toEqual(['kitchen_docket'])
  })

  it('prints the receipt once a table-QR order is paid', () => {
    expect(
      jobTypesForOrder({
        source: 'web',
        status: 'paid',
        delivery_type: 'dine_in',
      })
    ).toEqual(['kitchen_docket', 'receipt'])
  })

  it('never adds a receipt to other web orders', () => {
    expect(
      jobTypesForOrder({ source: 'web', status: 'paid', delivery_type: 'delivery' })
    ).toEqual(['kitchen_docket'])
  })
})
