import { describe, it, expect } from 'vitest'
import {
  isSnoozed,
  isSnoozeSameDay,
  isEffectivelyAvailable,
  grabAvailableStatusFor,
  buildMenuRecordUpdates,
  buildSingleItemUpdate,
  toBatchMenuEntries,
} from '../menu'
import type { GrabMenuMappingRow } from '../menu'

// 2026-10-11 10:00 MYT (02:00 UTC) — a Sunday morning in KL.
const NOW = new Date('2026-10-11T02:00:00Z')
const TONIGHT_20MYT = '2026-10-11T12:00:00Z' // 20:00 MYT same day
const TOMORROW = '2026-10-12T02:00:00Z' // 10:00 MYT next day
const YESTERDAY = '2026-10-10T23:00:00Z' // already expired

function mapping(overrides: Partial<GrabMenuMappingRow> = {}): GrabMenuMappingRow {
  return {
    channel_product_id: 'cp-1',
    menu_item_id: 'mi-1',
    menu_item_name: 'Nasi Lemak',
    menu_item_price_cents: 1250,
    menu_item_is_available: true,
    menu_item_snooze_till: null,
    menu_item_category_id: 'cat-1',
    external_category_id: null,
    external_item_id: 'grab-item-1',
    external_name: 'Nasi Lemak',
    channel_price_cents: null,
    channel_is_available: true,
    channel_snooze_till: null,
    ...overrides,
  }
}

describe('isSnoozed', () => {
  it('is false without a snooze or for expired ones', () => {
    expect(isSnoozed(null, NOW)).toBe(false)
    expect(isSnoozed(undefined, NOW)).toBe(false)
    expect(isSnoozed(YESTERDAY, NOW)).toBe(false)
  })

  it('is true while the snooze timestamp is in the future', () => {
    expect(isSnoozed(TONIGHT_20MYT, NOW)).toBe(true)
  })
})

describe('isSnoozeSameDay', () => {
  it('treats a snooze ending later the same MYT day as same-day', () => {
    expect(isSnoozeSameDay(TONIGHT_20MYT, NOW)).toBe(true)
  })

  it('treats a snooze ending the next MYT day as not same-day', () => {
    expect(isSnoozeSameDay(TOMORROW, NOW)).toBe(false)
  })
})

describe('isEffectivelyAvailable', () => {
  it('requires both master and channel availability', () => {
    expect(isEffectivelyAvailable(mapping(), NOW)).toBe(true)
    expect(isEffectivelyAvailable(mapping({ channel_is_available: false }), NOW)).toBe(false)
    expect(isEffectivelyAvailable(mapping({ menu_item_is_available: false }), NOW)).toBe(false)
  })

  it('an active snooze on either level makes it unavailable', () => {
    expect(isEffectivelyAvailable(mapping({ channel_snooze_till: TONIGHT_20MYT }), NOW)).toBe(false)
    expect(isEffectivelyAvailable(mapping({ menu_item_snooze_till: TONIGHT_20MYT }), NOW)).toBe(
      false
    )
  })

  it('an expired snooze does not block availability (no restore write needed)', () => {
    expect(isEffectivelyAvailable(mapping({ channel_snooze_till: YESTERDAY }), NOW)).toBe(true)
  })
})

describe('grabAvailableStatusFor', () => {
  it('maps a fully available item to AVAILABLE', () => {
    expect(grabAvailableStatusFor(mapping(), NOW)).toBe('AVAILABLE')
  })

  it('maps hard unavailable to UNAVAILABLE', () => {
    expect(grabAvailableStatusFor(mapping({ menu_item_is_available: false }), NOW)).toBe(
      'UNAVAILABLE'
    )
  })

  it('maps a same-day snooze to UNAVAILABLETODAY (auto-restores on Grab)', () => {
    expect(grabAvailableStatusFor(mapping({ channel_snooze_till: TONIGHT_20MYT }), NOW)).toBe(
      'UNAVAILABLETODAY'
    )
  })

  it('maps a longer snooze to UNAVAILABLE', () => {
    expect(grabAvailableStatusFor(mapping({ channel_snooze_till: TOMORROW }), NOW)).toBe(
      'UNAVAILABLE'
    )
  })

  it('expired snoozes do not affect the status', () => {
    expect(grabAvailableStatusFor(mapping({ channel_snooze_till: YESTERDAY }), NOW)).toBe(
      'AVAILABLE'
    )
  })
})

describe('buildMenuRecordUpdates', () => {
  it('uses the channel price override when set', () => {
    const [record] = buildMenuRecordUpdates([mapping({ channel_price_cents: 1500 })], 'mch', NOW)
    expect(record).toMatchObject({ id: 'grab-item-1', price: 1500 })
  })

  it('falls back to the master price', () => {
    const [record] = buildMenuRecordUpdates([mapping()], 'mch', NOW)
    expect(record).toMatchObject({ price: 1250 })
  })

  it('skips unmapped products', () => {
    const records = buildMenuRecordUpdates([mapping({ external_item_id: null })], 'mch', NOW)
    expect(records).toHaveLength(0)
  })

  it('adds maxStock 0 only for UNAVAILABLE (Grab requirement)', () => {
    const records = buildMenuRecordUpdates(
      [
        mapping(),
        mapping({ external_item_id: 'grab-item-2', menu_item_is_available: false }),
        mapping({ external_item_id: 'grab-item-3', channel_snooze_till: TONIGHT_20MYT }),
      ],
      'mch',
      NOW
    )
    expect(records[0]).toEqual({
      merchantID: 'mch',
      field: 'ITEM',
      id: 'grab-item-1',
      price: 1250,
      availableStatus: 'AVAILABLE',
    })
    expect(records[1]).toMatchObject({ id: 'grab-item-2', availableStatus: 'UNAVAILABLE', maxStock: 0 })
    expect(records[2]).toMatchObject({ id: 'grab-item-3', availableStatus: 'UNAVAILABLETODAY' })
    expect(records[2]).not.toHaveProperty('maxStock')
  })

  it('buildSingleItemUpdate returns null for unmapped products', () => {
    expect(buildSingleItemUpdate(mapping({ external_item_id: null }), 'mch', NOW)).toBeNull()
  })
})

describe('toBatchMenuEntries', () => {
  const record = (id: string, merchantID = 'mch') => ({
    merchantID,
    field: 'ITEM' as const,
    id,
    price: 1000,
    availableStatus: 'AVAILABLE' as const,
  })

  it('wraps flat records into entries and keeps entities intact', () => {
    const entries = toBatchMenuEntries([record('a'), record('b')], 200)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      merchantID: 'mch',
      field: 'ITEM',
      menuEntities: [
        { id: 'a', price: 1000, availableStatus: 'AVAILABLE' },
        { id: 'b', price: 1000, availableStatus: 'AVAILABLE' },
      ],
    })
  })

  it('chunks at batchSize entities per entry', () => {
    const records = Array.from({ length: 250 }, (_, i) => record(`item-${i}`))
    const entries = toBatchMenuEntries(records, 200)
    expect(entries).toHaveLength(2)
    expect(entries[0].menuEntities).toHaveLength(200)
    expect(entries[1].menuEntities).toHaveLength(50)
  })

  it('drops undefined optional fields from entities', () => {
    const entries = toBatchMenuEntries(
      [{ merchantID: 'mch', field: 'ITEM', id: 'a' }],
      200
    )
    expect(entries[0].menuEntities[0]).toEqual({ id: 'a' })
  })
})
