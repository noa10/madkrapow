import { getUnsatisfiedRequiredGroups, requiredSelectionCount } from '@/lib/menu/required-options'

export type CheckoutModifierGroup = {
  id: string
  name: string
  is_required: boolean
  min_selections: number
  max_selections: number
}

export type CheckoutModifier = {
  id: string
  name: string
  modifier_group_id: string
}

export type ModifierSelectionError = {
  code:
    | 'DUPLICATE_MODIFIER'
    | 'INVALID_MODIFIER'
    | 'MODIFIER_LIMIT_EXCEEDED'
    | 'REQUIRED_MODIFIER_MISSING'
  message: string
}

interface ValidateModifierSelectionsArgs {
  itemName: string
  /** Groups attached to this item, with the per-item `is_required` flag. */
  groups: CheckoutModifierGroup[]
  selectedModifierIds: string[]
  /** Every submitted modifier id, keyed by id, fetched from the database. */
  modifiersById: ReadonlyMap<string, CheckoutModifier>
}

/**
 * Validates one cart line's modifier picks against the groups attached to
 * that item. This is the checkout trust boundary: the client payload can be
 * crafted, so membership, duplicate ids, per-group maximums and required
 * minimums are all checked server-side.
 *
 * Returns `null` when the selection is valid, otherwise the first error to
 * surface to the customer.
 */
export function validateModifierSelections({
  itemName,
  groups,
  selectedModifierIds,
  modifiersById,
}: ValidateModifierSelectionsArgs): ModifierSelectionError | null {
  const groupsById = new Map(groups.map((group) => [group.id, group]))
  const selectedCountByGroup: Record<string, number> = {}
  const seenModifierIds = new Set<string>()

  for (const modifierId of selectedModifierIds) {
    if (seenModifierIds.has(modifierId)) {
      const modifier = modifiersById.get(modifierId)
      return {
        code: 'DUPLICATE_MODIFIER',
        message: `${modifier?.name ?? 'That option'} was selected more than once for ${itemName}`,
      }
    }
    seenModifierIds.add(modifierId)

    const modifier = modifiersById.get(modifierId)
    if (!modifier) {
      return {
        code: 'INVALID_MODIFIER',
        message: `An option selected for ${itemName} is no longer available`,
      }
    }

    // A modifier may only be attached to the item through its own group;
    // otherwise a crafted payload could pull in another dish's options.
    if (!groupsById.has(modifier.modifier_group_id)) {
      return {
        code: 'INVALID_MODIFIER',
        message: `${modifier.name} is not available for ${itemName}`,
      }
    }

    selectedCountByGroup[modifier.modifier_group_id] =
      (selectedCountByGroup[modifier.modifier_group_id] ?? 0) + 1
  }

  for (const group of groups) {
    const selectedCount = selectedCountByGroup[group.id] ?? 0
    if (selectedCount > group.max_selections) {
      return {
        code: 'MODIFIER_LIMIT_EXCEEDED',
        message: `${itemName} allows at most ${group.max_selections} option(s) from "${group.name}"`,
      }
    }
  }

  const missingGroups = getUnsatisfiedRequiredGroups(groups, selectedCountByGroup)
  if (missingGroups.length > 0) {
    const group = missingGroups[0]
    return {
      code: 'REQUIRED_MODIFIER_MISSING',
      message: `${itemName} requires selecting at least ${requiredSelectionCount(group)} option(s) from "${group.name}"`,
    }
  }

  return null
}
