import type { FullMenuItem } from '@/lib/queries/menu'

type ItemModifierGroup = FullMenuItem['modifier_groups'][number]

export type RequiredModifierGroup = {
  id: string
  name: string
  is_required: boolean
  min_selections: number
}

/**
 * A group counts as required when either the per-item link (`is_required`)
 * or the group's own minimum says so. The live data uses one or the other
 * depending on how the group was attached to the item, so both must be
 * honoured — checking only one lets required options through.
 */
export function isModifierGroupRequired(
  group: Pick<RequiredModifierGroup, 'is_required' | 'min_selections'>
): boolean {
  return group.is_required || group.min_selections > 0
}

/**
 * How many picks a required group needs: its `min_selections`, but at least
 * one when the requirement came from the per-item link alone.
 */
export function requiredSelectionCount(
  group: Pick<RequiredModifierGroup, 'is_required' | 'min_selections'>
): number {
  return Math.max(1, group.min_selections)
}

/**
 * Required groups that still need picks, in menu order.
 * `selectedCountByGroup` holds how many selections currently belong to each
 * group (duplicates count — a group seeded with duplicate modifier ids needs
 * just as many picks).
 */
export function getUnsatisfiedRequiredGroups<T extends RequiredModifierGroup>(
  groups: T[],
  selectedCountByGroup: Record<string, number>
): T[] {
  return groups.filter(
    (group) =>
      isModifierGroupRequired(group) &&
      (selectedCountByGroup[group.id] ?? 0) < requiredSelectionCount(group)
  )
}

/**
 * Names of required groups that still need picks, in menu order — used by
 * the ordering surfaces, where selections are held as ids per group.
 */
export function getUnsatisfiedRequiredGroupNames(
  modifierGroups: ItemModifierGroup[],
  selectedModifierIds: Record<string, string[]>
): string[] {
  const selectedCountByGroup: Record<string, number> = {}
  for (const group of modifierGroups) {
    selectedCountByGroup[group.id] = selectedModifierIds[group.id]?.length ?? 0
  }
  return getUnsatisfiedRequiredGroups(modifierGroups, selectedCountByGroup).map(
    (group) => group.name
  )
}
