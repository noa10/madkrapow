import { describe, expect, it } from 'vitest'
import { canStaffPrintOrder } from '../staff-access'

describe('staff print access', () => {
  const order = { status: 'paid', source: 'web', deliveryType: 'delivery' }
  it.each(['paid', 'accepted', 'preparing', 'ready'])('allows kitchen queue status %s', (status) => {
    expect(canStaffPrintOrder('kitchen', { ...order, status })).toBe(true)
  })
  it.each(['cancelled', 'delivered', 'picked_up', 'pending'])('rejects non-queue kitchen status %s', (status) => {
    expect(canStaffPrintOrder('kitchen', { ...order, status })).toBe(false)
  })
  it('allows only pending dine-in or counter orders for kitchen', () => {
    expect(canStaffPrintOrder('kitchen', { ...order, status: 'pending', deliveryType: 'dine_in' })).toBe(true)
    expect(canStaffPrintOrder('kitchen', { ...order, status: 'pending', source: 'counter' })).toBe(true)
  })
  it('allows admin, manager and cashier to print history but rejects other roles', () => {
    for (const role of ['admin', 'manager', 'cashier']) {
      expect(canStaffPrintOrder(role, { ...order, status: 'delivered' })).toBe(true)
    }
    expect(canStaffPrintOrder('customer', order)).toBe(false)
  })
})
