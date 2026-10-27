import { describe, expect, it } from 'vitest'
import {
  lineTotalCents,
  mergeTableOrderItems,
  type TableOrderItemInput,
} from '../table-orders'

function item(overrides: Partial<TableOrderItemInput> = {}): TableOrderItemInput {
  return {
    menu_item_id: 'item-1',
    quantity: 1,
    modifier_ids: [],
    ...overrides,
  }
}

describe('mergeTableOrderItems', () => {
  it('merges the same item with the same options', () => {
    const merged = mergeTableOrderItems([
      item({ quantity: 1, modifier_ids: ['b', 'a'] }),
      item({ quantity: 2, modifier_ids: ['a', 'b'] }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ quantity: 3, modifier_ids: ['a', 'b'] })
  })

  it('keeps different option sets as separate lines', () => {
    const merged = mergeTableOrderItems([
      item({ modifier_ids: ['a'] }),
      item({ modifier_ids: ['b'] }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('keeps different notes as separate lines', () => {
    const merged = mergeTableOrderItems([
      item({ notes: 'no chilli' }),
      item({ notes: 'extra chilli' }),
      item(),
    ])
    expect(merged).toHaveLength(3)
  })

  it('merges lines that share the same note', () => {
    const merged = mergeTableOrderItems([
      item({ quantity: 1, notes: 'no chilli' }),
      item({ quantity: 2, notes: 'no chilli' }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ quantity: 3, notes: 'no chilli' })
  })

  it('keeps different dishes separate', () => {
    const merged = mergeTableOrderItems([
      item({ menu_item_id: 'a' }),
      item({ menu_item_id: 'b' }),
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('lineTotalCents', () => {
  it('adds modifier deltas before multiplying by quantity', () => {
    expect(lineTotalCents(1250, [100, 50], 2)).toBe(2800)
    expect(lineTotalCents(1250, [], 1)).toBe(1250)
    expect(lineTotalCents(0, [250], 3)).toBe(750)
  })
})
