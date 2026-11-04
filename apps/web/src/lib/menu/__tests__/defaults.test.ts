import { describe, expect, it } from 'vitest'
import { defaultModifierSelections, type DefaultSelectableGroup } from '../defaults'

function group(overrides: Partial<DefaultSelectableGroup> = {}): DefaultSelectableGroup {
  return {
    id: 'group-1',
    max_selections: 1,
    modifiers: [
      { id: 'mild', is_default: false, is_available: true },
      { id: 'spicy', is_default: true, is_available: true },
    ],
    ...overrides,
  }
}

describe('defaultModifierSelections', () => {
  it('ticks the default modifier in single-choice groups', () => {
    expect(defaultModifierSelections([group()])).toEqual({ 'group-1': ['spicy'] })
  })

  it('leaves a single-choice group empty when no modifier is marked default', () => {
    const groups = [group({ modifiers: [
      { id: 'regular', is_default: false, is_available: true },
      { id: 'large', is_default: false, is_available: true },
    ] })]
    expect(defaultModifierSelections(groups)).toEqual({})
  })

  it('ignores a default that is unavailable', () => {
    const groups = [group({ modifiers: [
      { id: 'spicy', is_default: true, is_available: false },
      { id: 'mild', is_default: false, is_available: true },
    ] })]
    expect(defaultModifierSelections(groups)).toEqual({})
  })

  it('does not preselect anything in multi-select groups', () => {
    const groups = [group({ max_selections: 3 })]
    expect(defaultModifierSelections(groups)).toEqual({})
  })

  it('uses the first default in menu order when several are flagged', () => {
    const groups = [group({ modifiers: [
      { id: 'first', is_default: true, is_available: true },
      { id: 'second', is_default: true, is_available: true },
    ] })]
    expect(defaultModifierSelections(groups)).toEqual({ 'group-1': ['first'] })
  })
})
