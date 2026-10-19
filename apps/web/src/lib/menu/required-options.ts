import type { FullMenuItem } from '@/lib/queries/menu'

type ItemModifierGroup = FullMenuItem['modifier_groups'][number]

/**
 * A group counts as required when either the per-item link (`is_required`)
 * or the group's own minimum says so. The live data uses one or the other
 * depending on how the group was attached to the item, so both must be
 * honoured — checking only one lets required options through.
 */
export function isModifierGroupRequired(
  group: Pick<ItemModifierGroup, 'is_required' | 'min_selections'>
): boolean {
  return group.is_required || group.min_selections > 0
}

/**
 * Names of required groups that still need picks, in menu order.
 * A required group needs at least one selection even when its
 * `min_selections` is 0 (the requirement came from the item link).
 */
export function getUnsatisfiedRequiredGroupNames(
  modifierGroups: ItemModifierGroup[],
  selectedModifierIds: Record<string, string[]>
): string[] {
  return modifierGroups
    .filter((group) => {
      if (!isModifierGroupRequired(group)) return false
      const selectedCount = selectedModifierIds[group.id]?.length ?? 0
      return selectedCount < Math.max(1, group.min_selections)
    })
    .map((group) => group.name)
}
