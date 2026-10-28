import { describe, expect, it } from 'vitest'
import { posCartLineKey, posLineTotalCents } from '../cart'

describe('posCartLineKey', () => {
  it('is stable regardless of modifier order', () => {
    expect(posCartLineKey('item-1', ['b', 'a'], '')).toBe(
      posCartLineKey('item-1', ['a', 'b'], '')
    )
  })

  it('keeps different add-ons separate', () => {
    expect(posCartLineKey('item-1', ['a'], '')).not.toBe(
      posCartLineKey('item-1', ['b'], '')
    )
  })

  it('keeps different kitchen notes separate', () => {
    expect(posCartLineKey('item-1', [], 'no chilli')).not.toBe(
      posCartLineKey('item-1', [], 'extra chilli')
    )
    expect(posCartLineKey('item-1', [], ' no chilli ')).toBe(
      posCartLineKey('item-1', [], 'no chilli')
    )
  })

  it('keeps different dishes separate', () => {
    expect(posCartLineKey('item-1', [], '')).not.toBe(
      posCartLineKey('item-2', [], '')
    )
  })
})

describe('posLineTotalCents', () => {
  it('adds add-on deltas before multiplying by quantity', () => {
    expect(
      posLineTotalCents(
        1250,
        [{ id: 'a', name: 'Egg', price_delta_cents: 200 }],
        2
      )
    ).toBe(2900)
    expect(posLineTotalCents(1250, [], 3)).toBe(3750)
  })
})
