export interface StoreSettings {
  bulk_enabled: boolean
  bulk_threshold_cents: number
  bulk_min_notice_hours: number
  bulk_max_items_per_slot: number
  bulk_extra_prep_minutes: number
  bulk_delivery_fee_cents: number
  bulk_packaging_fee_cents: number
}

export interface CapacityResult {
  ok: boolean
  reason?: string
}

export function checkBulkCapacity(
  settings: StoreSettings,
  requestedDate: Date,
  itemCount: number
): CapacityResult {
  if (!settings.bulk_enabled) {
    return { ok: false, reason: 'Bulk ordering is not available' }
  }

  const now = new Date()
  const hoursUntil = (requestedDate.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (hoursUntil < settings.bulk_min_notice_hours) {
    return { ok: false, reason: `Minimum ${settings.bulk_min_notice_hours} hours notice required for bulk orders` }
  }

  if (itemCount > settings.bulk_max_items_per_slot) {
    return { ok: false, reason: `Maximum ${settings.bulk_max_items_per_slot} items per bulk order. Please contact us for larger orders.` }
  }

  return { ok: true }
}

export function shouldTriggerBulkReview(
  subtotalCents: number,
  itemCount: number,
  settings: StoreSettings
): boolean {
  if (!settings.bulk_enabled) return false
  return subtotalCents >= settings.bulk_threshold_cents || itemCount >= 10
}
