/**
 * Menu record updates: MadKrapow product (master) -> GrabFood records.
 *
 * channel_products holds the per-channel mapping (external_item_id, channel
 * price override, availability, snooze). This module builds the per-item
 * record updates Grab's API consumes (PUT /partner/v1/menu) — the only menu
 * writes this integration makes; the batch catalogue push is descoped.
 *
 * Grab semantics (per the official OpenAPI models):
 *   - availableStatus: AVAILABLE | UNAVAILABLE | UNAVAILABLETODAY
 *   - UNAVAILABLE must be accompanied by maxStock = 0; maxStock > 0 implies
 *     AVAILABLE. UNAVAILABLETODAY auto-restores at Grab's next business day.
 *
 * Snooze (time-based sold-out) always maps to UNAVAILABLE + maxStock 0. It is
 * deliberately NOT mapped to UNAVAILABLETODAY: that state auto-restores at
 * Grab's next business day, while a 30-minute snooze must come back after 30
 * minutes. A durable restore job scans snooze_restore_required and pushes
 * AVAILABLE at expiry (see the menu-restore cron).
 */

import type { GrabAvailableStatus, GrabMenuRecordUpdate } from './types'

/** Malaysia never observes DST: MYT is a fixed UTC+8 offset. */
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

export interface GrabMenuMappingRow {
  channel_product_id: string
  menu_item_id: string
  menu_item_name: string
  menu_item_price_cents: number
  menu_item_is_available: boolean
  menu_item_snooze_till: string | null
  external_item_id: string | null
  external_name: string | null
  channel_price_cents: number | null
  channel_is_available: boolean
  channel_snooze_till: string | null
}

/** A snooze is active while `snoozeTill` is in the future. */
export function isSnoozed(snoozeTill: string | null | undefined, now: Date = new Date()): boolean {
  if (!snoozeTill) return false
  const t = new Date(snoozeTill).getTime()
  return !Number.isNaN(t) && t > now.getTime()
}

/**
 * True when the snooze ends within the merchant's current calendar day in
 * Malaysia (UTC+8). Kept for diagnostics; availability no longer maps this to
 * UNAVAILABLETODAY because a 30-minute snooze must restore after 30 minutes,
 * not at Grab's next business day.
 */
export function isSnoozeSameDay(snoozeTill: string, now: Date = new Date()): boolean {
  const t = new Date(snoozeTill).getTime()
  if (Number.isNaN(t)) return false
  const dayOf = (ms: number) => Math.floor((ms + MYT_OFFSET_MS) / 86_400_000)
  return dayOf(t) === dayOf(now.getTime())
}

/**
 * Effective availability: master AND channel, each also gated by an active
 * snooze. Computed at read time — an expired snooze never needs a write.
 */
export function isEffectivelyAvailable(
  mapping: Pick<
    GrabMenuMappingRow,
    | 'menu_item_is_available'
    | 'menu_item_snooze_till'
    | 'channel_is_available'
    | 'channel_snooze_till'
  >,
  now: Date = new Date()
): boolean {
  return (
    mapping.menu_item_is_available &&
    !isSnoozed(mapping.menu_item_snooze_till, now) &&
    mapping.channel_is_available &&
    !isSnoozed(mapping.channel_snooze_till, now)
  )
}

/** Map a mapping row's effective state onto Grab's availableStatus enum. */
export function grabAvailableStatusFor(
  mapping: Pick<
    GrabMenuMappingRow,
    | 'menu_item_is_available'
    | 'menu_item_snooze_till'
    | 'channel_is_available'
    | 'channel_snooze_till'
  >,
  now: Date = new Date()
): GrabAvailableStatus {
  if (isEffectivelyAvailable(mapping, now)) return 'AVAILABLE'
  return 'UNAVAILABLE'
}

/**
 * Build Grab menu record updates for every fully-mapped product.
 * Price: channel override when set, else the master price.
 * Availability: effective (master AND channel AND snooze) — UNAVAILABLE
 * carries maxStock 0 as Grab requires.
 */
export function buildMenuRecordUpdates(
  mappings: GrabMenuMappingRow[],
  merchantId: string,
  now: Date = new Date()
): GrabMenuRecordUpdate[] {
  return mappings
    .filter((m) => m.external_item_id && m.menu_item_id)
    .map((m) => {
      const availableStatus = grabAvailableStatusFor(m, now)
      return {
        merchantID: merchantId,
        field: 'ITEM' as const,
        id: m.external_item_id as string,
        name: m.external_name ?? m.menu_item_name,
        price: m.channel_price_cents ?? m.menu_item_price_cents,
        availableStatus,
        ...(availableStatus === 'UNAVAILABLE' ? { maxStock: 0 } : {}),
      }
    })
}

/**
 * Per-item record for a single product's state — used by the snooze routes.
 * Carries the stored price (channel override when set, else master price)
 * alongside availability, so the next write syncs both.
 */
export function buildSingleItemUpdate(
  mapping: GrabMenuMappingRow,
  merchantId: string,
  now: Date = new Date()
): GrabMenuRecordUpdate | null {
  if (!mapping.external_item_id) return null
  return buildMenuRecordUpdates([mapping], merchantId, now)[0] ?? null
}

/**
 * A snooze is due for restoration when its timestamp has passed and the
 * channel row still marks a restore as required. The restore cron uses this
 * against the database; keeping it pure makes the boundary testable.
 */
export function isSnoozeRestoreDue(
  snoozeTill: string | null | undefined,
  restoreRequired: boolean,
  now: Date = new Date()
): boolean {
  if (!restoreRequired || !snoozeTill) return false
  const t = new Date(snoozeTill).getTime()
  return !Number.isNaN(t) && t <= now.getTime()
}

