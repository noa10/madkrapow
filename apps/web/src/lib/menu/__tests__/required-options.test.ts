import { describe, expect, it } from 'vitest'
import type { FullMenuItem } from '@/lib/queries/menu'
import {
  getUnsatisfiedRequiredGroups,
  getUnsatisfiedRequiredGroupNames,
  isModifierGroupRequired,
  requiredSelectionCount,
} from '@/lib/menu/required-options'

type ItemModifierGroup = FullMenuItem['modifier_groups'][number]

function makeGroup(
  overrides: Partial<ItemModifierGroup> & Pick<ItemModifierGroup, 'id' | 'name'>
): ItemModifierGroup {
  return {
    description: null,
    min_selections: 0,
    max_selections: 1,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_required: false,
    modifiers: [],
    ...overrides,
  }
}

describe('isModifierGroupRequired', () => {
  it('treats a group as required when the item link says so, even with min_selections 0', () => {
    expect(isModifierGroupRequired({ is_required: true, min_selections: 0 })).toBe(true)
  })

  it('treats a group as required when only the group minimum says so', () => {
    expect(isModifierGroupRequired({ is_required: false, min_selections: 1 })).toBe(true)
  })

  it('treats a group as optional when neither source says required', () => {
    expect(isModifierGroupRequired({ is_required: false, min_selections: 0 })).toBe(false)
  })
})

describe('requiredSelectionCount', () => {
  it('needs at least one pick when only the item link says required', () => {
    expect(requiredSelectionCount({ is_required: true, min_selections: 0 })).toBe(1)
  })

  it('needs the group minimum when it is higher', () => {
    expect(requiredSelectionCount({ is_required: true, min_selections: 2 })).toBe(2)
    expect(requiredSelectionCount({ is_required: false, min_selections: 2 })).toBe(2)
  })
})

describe('getUnsatisfiedRequiredGroups', () => {
  const spice = { id: 'spice', name: 'Tahap Kepedasan', is_required: false, min_selections: 1 }
  const berat = { id: 'berat', name: 'Berat', is_required: true, min_selections: 0 }

  it('counts picks per group, not across the whole item', () => {
    // Two picks in `berat` must not satisfy the spice group.
    expect(
      getUnsatisfiedRequiredGroups([spice, berat], { berat: 2 }).map((group) => group.name)
    ).toEqual(['Tahap Kepedasan'])
  })

  it('satisfies link-required groups with a single pick', () => {
    expect(getUnsatisfiedRequiredGroups([berat], { berat: 1 })).toEqual([])
  })

  it('ignores optional groups entirely', () => {
    const drinks = { id: 'drinks', name: 'Minuman', is_required: false, min_selections: 0 }
    expect(getUnsatisfiedRequiredGroups([drinks], {})).toEqual([])
  })
})

describe('getUnsatisfiedRequiredGroupNames', () => {
  const spice = makeGroup({
    id: 'spice',
    name: 'Tahap Kepedasan',
    min_selections: 1,
  })

  it('blocks a group required only by the item link at 0 picks', () => {
    const berat = makeGroup({ id: 'berat', name: 'Berat', is_required: true })

    expect(getUnsatisfiedRequiredGroupNames([berat], {})).toEqual(['Berat'])
    expect(getUnsatisfiedRequiredGroupNames([berat], { berat: ['135g'] })).toEqual([])
  })

  it('blocks a group required only by the group minimum at 0 picks', () => {
    expect(getUnsatisfiedRequiredGroupNames([spice], {})).toEqual(['Tahap Kepedasan'])
    expect(getUnsatisfiedRequiredGroupNames([spice], { spice: ['pedas'] })).toEqual([])
  })

  it('requires min_selections picks, not just one', () => {
    const sauces = makeGroup({ id: 'sauces', name: 'Sos', min_selections: 2, max_selections: 2 })

    expect(getUnsatisfiedRequiredGroupNames([sauces], { sauces: ['sambal'] })).toEqual(['Sos'])
    expect(getUnsatisfiedRequiredGroupNames([sauces], { sauces: ['sambal', 'chili'] })).toEqual([])
  })

  it('never blocks optional groups', () => {
    const drinks = makeGroup({ id: 'drinks', name: 'Minuman' })

    expect(getUnsatisfiedRequiredGroupNames([drinks], {})).toEqual([])
  })

  it('does not let picks from another group satisfy a required group', () => {
    expect(getUnsatisfiedRequiredGroupNames([spice], { berat: ['135g'] })).toEqual([
      'Tahap Kepedasan',
    ])
  })

  it('reports every unsatisfied group in item order', () => {
    const berat = makeGroup({ id: 'berat', name: 'Berat', is_required: true })
    const basil = makeGroup({ id: 'basil', name: 'Daun Basil', is_required: true })

    expect(
      getUnsatisfiedRequiredGroupNames([spice, berat, basil], { berat: ['135g'] })
    ).toEqual(['Tahap Kepedasan', 'Daun Basil'])
  })
})
