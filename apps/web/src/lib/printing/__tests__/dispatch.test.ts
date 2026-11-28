import { describe, expect, it, vi } from 'vitest'

// `dispatch.ts` reads store details from the validated env at call time.
vi.mock('@/lib/validators/env', () => ({
  env: { STORE_ADDRESS: '', STORE_PHONE: '' },
}))

import { jobTypesForOrder } from '../dispatch'

describe('jobTypesForOrder', () => {
  it('prints a docket and receipt for Grab orders, not the courier ticket', () => {
    expect(jobTypesForOrder({ source: 'grabfood', status: 'paid' })).toEqual([
      'kitchen_docket',
      'receipt',
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

  it('prints the docket and receipt for a paid web order', () => {
    expect(
      jobTypesForOrder({ source: 'web', status: 'paid', delivery_type: 'delivery' })
    ).toEqual(['kitchen_docket', 'receipt'])
  })

  it('prints nothing for an unpaid web order — an abandoned checkout is not food', () => {
    expect(
      jobTypesForOrder({ source: 'web', status: 'pending', delivery_type: 'delivery' })
    ).toEqual([])
    expect(
      jobTypesForOrder({ source: 'web', status: 'pending', delivery_type: 'pickup' })
    ).toEqual([])
  })

  it('prints a completed counter pickup that still carries kitchen state', () => {
    expect(
      jobTypesForOrder({
        source: 'counter',
        status: 'delivered',
        delivery_type: 'self_pickup',
        kitchen_status: 'paid',
      })
    ).toEqual(['kitchen_docket', 'receipt'])
  })

  it('still prints a completed pickup after the kitchen marks it ready', () => {
    expect(
      jobTypesForOrder({
        source: 'counter',
        status: 'delivered',
        delivery_type: 'self_pickup',
        kitchen_status: 'ready',
      })
    ).toEqual(['kitchen_docket', 'receipt'])
  })

  it('prints nothing for a historical delivered counter pickup without kitchen state', () => {
    expect(
      jobTypesForOrder({
        source: 'counter',
        status: 'delivered',
        delivery_type: 'self_pickup',
        kitchen_status: null,
      })
    ).toEqual([])
  })

  it('prints nothing for a delivered web pickup even when kitchen state is present', () => {
    expect(
      jobTypesForOrder({
        source: 'web',
        status: 'delivered',
        delivery_type: 'self_pickup',
        kitchen_status: 'paid',
      })
    ).toEqual([])
  })

  it('prints nothing for a delivered Grab order that kitchen state cannot make eligible', () => {
    expect(
      jobTypesForOrder({
        source: 'grabfood',
        status: 'delivered',
        delivery_type: 'delivery',
        kitchen_status: 'paid',
      })
    ).toEqual([])
  })
})
