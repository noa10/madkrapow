export type DefaultSelectableGroup = {
  id: string
  max_selections: number
  modifiers: Array<{
    id: string
    is_default: boolean
    is_available: boolean
  }>
}

/**
 * Initial radio selections for an item page.
 *
 * Only single-choice groups (radio buttons) are pre-ticked, and only when a
 * modifier is explicitly marked Default and still available. Guessing the
 * first option would silently add a paid choice the customer never made.
 */
export function defaultModifierSelections(
  groups: DefaultSelectableGroup[]
): Record<string, string[]> {
  const selections: Record<string, string[]> = {}
  for (const group of groups) {
    if (group.max_selections !== 1) continue
    const chosen = group.modifiers.find(
      (modifier) => modifier.is_default && modifier.is_available
    )
    if (chosen) selections[group.id] = [chosen.id]
  }
  return selections
}
