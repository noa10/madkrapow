import { describe, expect, it } from 'vitest'
import {
  validateModifierSelections,
  type CheckoutModifier,
  type CheckoutModifierGroup,
} from '@/lib/menu/checkout-modifiers'

function makeGroup(
  overrides: Partial<CheckoutModifierGroup> & Pick<CheckoutModifierGroup, 'id' | 'name'>
): CheckoutModifierGroup {
  return {
    is_required: false,
    min_selections: 0,
    max_selections: 1,
    ...overrides,
  }
}

function makeModifier(
  overrides: Partial<CheckoutModifier> & Pick<CheckoutModifier, 'id' | 'modifier_group_id'>
): CheckoutModifier {
  return {
    name: overrides.id,
    ...overrides,
  }
}

function toMap(modifiers: CheckoutModifier[]): Map<string, CheckoutModifier> {
  return new Map(modifiers.map((modifier) => [modifier.id, modifier]))
}

describe('validateModifierSelections', () => {
  const spice = makeGroup({ id: 'spice', name: 'Tahap Kepedasan', min_selections: 1 })
  const sauces = makeGroup({
    id: 'sauces',
    name: 'Sos',
    is_required: true,
    min_selections: 2,
    max_selections: 2,
  })
  const modifiers = toMap([
    makeModifier({ id: 'mild', name: 'Mild', modifier_group_id: 'spice' }),
    makeModifier({ id: 'hot', name: 'Hot', modifier_group_id: 'spice' }),
    makeModifier({ id: 'sambal', name: 'Sambal', modifier_group_id: 'sauces' }),
    makeModifier({ id: 'chili', name: 'Chili', modifier_group_id: 'sauces' }),
    makeModifier({ id: 'other', name: 'Other dish option', modifier_group_id: 'other-group' }),
  ])

  it('accepts a selection that satisfies the group minimums', () => {
    expect(
      validateModifierSelections({
        itemName: 'Krapow',
        groups: [spice, sauces],
        selectedModifierIds: ['mild', 'sambal', 'chili'],
        modifiersById: modifiers,
      })
    ).toBeNull()
  })

  it('rejects a missing required selection', () => {
    const result = validateModifierSelections({
      itemName: 'Krapow',
      groups: [spice],
      selectedModifierIds: [],
      modifiersById: modifiers,
    })

    expect(result?.code).toBe('REQUIRED_MODIFIER_MISSING')
    expect(result?.message).toContain('Tahap Kepedasan')
  })

  it('rejects the same modifier submitted twice to fill a minimum', () => {
    const result = validateModifierSelections({
      itemName: 'Krapow',
      groups: [spice, sauces],
      selectedModifierIds: ['mild', 'sambal', 'sambal'],
      modifiersById: modifiers,
    })

    expect(result?.code).toBe('DUPLICATE_MODIFIER')
    expect(result?.message).toContain('Sambal')
  })

  it('rejects a modifier whose group is not attached to the item', () => {
    const result = validateModifierSelections({
      itemName: 'Krapow',
      groups: [spice],
      selectedModifierIds: ['other'],
      modifiersById: modifiers,
    })

    expect(result?.code).toBe('INVALID_MODIFIER')
    expect(result?.message).toContain('Other dish option')
  })

  it('rejects an unknown modifier id', () => {
    const result = validateModifierSelections({
      itemName: 'Krapow',
      groups: [spice],
      selectedModifierIds: ['gone'],
      modifiersById: modifiers,
    })

    expect(result?.code).toBe('INVALID_MODIFIER')
  })

  it('rejects more unique picks than the group maximum', () => {
    const drinks = makeGroup({ id: 'drinks', name: 'Minuman', max_selections: 1 })
    const drinksById = toMap([
      makeModifier({ id: 'tea', name: 'Teh', modifier_group_id: 'drinks' }),
      makeModifier({ id: 'water', name: 'Air', modifier_group_id: 'drinks' }),
    ])

    const result = validateModifierSelections({
      itemName: 'Krapow',
      groups: [drinks],
      selectedModifierIds: ['tea', 'water'],
      modifiersById: drinksById,
    })

    expect(result?.code).toBe('MODIFIER_LIMIT_EXCEEDED')
    expect(result?.message).toContain('Minuman')
  })

  it('does not require picks from optional groups', () => {
    const drinks = makeGroup({ id: 'drinks', name: 'Minuman' })

    expect(
      validateModifierSelections({
        itemName: 'Krapow',
        groups: [drinks],
        selectedModifierIds: [],
        modifiersById: modifiers,
      })
    ).toBeNull()
  })
})
