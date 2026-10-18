import { describe, it, expect } from 'vitest'
import {
  groupItemsByOrderId,
  type RawKitchenItemRow,
} from '../useKitchenOrderItems'

function row(
  overrides: Partial<RawKitchenItemRow> & { id: string; order_id: string }
): RawKitchenItemRow {
  return {
    menu_item_name: 'Nasi Goreng',
    quantity: 1,
    notes: null,
    order_item_modifiers: null,
    ...overrides,
  }
}

describe('groupItemsByOrderId', () => {
  it('groups rows under their order', () => {
    const result = groupItemsByOrderId([
      row({ id: 'i1', order_id: 'o1', menu_item_name: 'Nasi Goreng' }),
      row({ id: 'i2', order_id: 'o1', menu_item_name: 'Tom Yam' }),
      row({ id: 'i3', order_id: 'o2', menu_item_name: 'Pad Thai' }),
    ])

    expect(Object.keys(result).sort()).toEqual(['o1', 'o2'])
    expect(result.o1.map((i) => i.name)).toEqual(['Nasi Goreng', 'Tom Yam'])
    expect(result.o2.map((i) => i.name)).toEqual(['Pad Thai'])
  })

  it('preserves row order, which is the order dishes were added', () => {
    const result = groupItemsByOrderId([
      row({ id: 'i1', order_id: 'o1', menu_item_name: 'First' }),
      row({ id: 'i2', order_id: 'o1', menu_item_name: 'Second' }),
      row({ id: 'i3', order_id: 'o1', menu_item_name: 'Third' }),
    ])

    expect(result.o1.map((i) => i.name)).toEqual(['First', 'Second', 'Third'])
  })

  it('flattens embedded addons to names, in order', () => {
    const result = groupItemsByOrderId([
      row({
        id: 'i1',
        order_id: 'o1',
        order_item_modifiers: [
          { modifier_name: 'Extra Spicy' },
          { modifier_name: 'Add Egg' },
        ],
      }),
    ])

    expect(result.o1[0].modifiers).toEqual(['Extra Spicy', 'Add Egg'])
  })

  it('gives an item with no addons an empty array', () => {
    const result = groupItemsByOrderId([row({ id: 'i1', order_id: 'o1' })])
    expect(result.o1[0].modifiers).toEqual([])
  })

  it('defaults a null quantity to one', () => {
    const result = groupItemsByOrderId([
      row({ id: 'i1', order_id: 'o1', quantity: null }),
    ])
    expect(result.o1[0].quantity).toBe(1)
  })

  it('carries item notes through', () => {
    const result = groupItemsByOrderId([
      row({ id: 'i1', order_id: 'o1', notes: 'Less oil please' }),
    ])
    expect(result.o1[0].notes).toBe('Less oil please')
  })

  it('returns an empty object for no rows', () => {
    expect(groupItemsByOrderId([])).toEqual({})
  })
})
