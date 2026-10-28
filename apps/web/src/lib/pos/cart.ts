/**
 * Pure helpers for the POS sale cart. Framework-free and unit-tested so the
 * page, the panel and the API agree on line identity and money.
 */

export type PosCartModifier = {
  id: string
  name: string
  price_delta_cents: number
}

/**
 * Identity of a cart line: same dish + same options + same note. Two lines
 * with different add-ons (or different kitchen notes) must stay separate.
 */
export function posCartLineKey(
  menuItemId: string,
  modifierIds: readonly string[],
  notes: string
): string {
  return `${menuItemId}|${[...modifierIds].sort().join(',')}|${notes.trim()}`
}

/** Integer-cents line total: (base + sum of add-on deltas) × quantity. */
export function posLineTotalCents(
  basePriceCents: number,
  modifiers: readonly PosCartModifier[],
  quantity: number
): number {
  const unit =
    modifiers.reduce((sum, modifier) => sum + modifier.price_delta_cents, basePriceCents)
  return unit * quantity
}
