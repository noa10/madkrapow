/**
 * Hubbo merchant backend (alimentsBackend) types — recovered from the Hubbo
 * POS APK reverse engineering (docs/hubbo-re-findings.md). This is an
 * UNOFFICIAL API: parse defensively, every field optional.
 *
 * Response envelope: { code, message, body, errCode, reason } with the string
 * "200" marking success. Money fields: `price` (integer sen) with
 * `priceInTwoDecimal` as the display string; `grabfoodPrice` is the
 * GrabFood-specific selling price. `snoozeTill` is a epoch-seconds sold-out
 * timestamp; `sku` is the external-channel mapping key.
 */

export interface HubboMerchantCategory {
  id?: string
  name?: string
  desc?: string
  snoozeTill?: number
  /** Some payloads nest items under their category; accept both shapes. */
  items?: HubboMerchantMenuItem[]
  subCategories?: unknown[]
}

export interface HubboMerchantAddOn {
  id?: string
  name?: string
  price?: number
  priceInTwoDecimal?: string
  grabfoodPrice?: number
  menuId?: string
  addOnCategoryId?: string
  singleSelect?: boolean
  maxOrder?: number
  sku?: string
  snoozeTill?: number
}

export interface HubboMerchantMenuItem {
  id?: string
  name?: string
  desc?: string
  shortDesc?: string
  image?: string
  price?: number
  priceInTwoDecimal?: string
  grabfoodPrice?: number
  docketName?: string
  printerId?: string
  printerId2?: string
  sku?: string
  snoozeTill?: number
  maxOrder?: number
  categoryId?: string
  addOns?: HubboMerchantAddOn[]
}

export interface HubboMerchantMenu {
  categories?: HubboMerchantCategory[]
  items?: HubboMerchantMenuItem[]
}

export interface HubboMerchantEnvelope<T> {
  code?: string
  message?: string
  body?: T
  errCode?: string
  reason?: string
}

/** POST /api/merchant/snoozeMenu payload item (models/snooze_menu_item.dart). */
export interface HubboSnoozeMenuItem {
  menuId?: string
  snoozeTill?: number
  menuAddOnId?: string
  sku?: string
  categoryId?: string
}
