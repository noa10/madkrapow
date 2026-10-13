/**
 * Hubbo merchant backend (alimentsBackend) types — recovered from the Hubbo
 * POS APK reverse engineering (docs/hubbo-re-findings.md). This is an
 * UNOFFICIAL API: parse defensively, every field optional.
 *
 * Response shape — CONFIRMED against a live /api/merchant/menu pull. The menu
 * endpoint returns a FLAT envelope: the payload lives at the top level
 * (`menu[]`, `categories[]`, `merchant`) beside `code: "200"`, NOT wrapped in a
 * `body` field (do not read `envelope.body`). Money fields are RM decimals
 * (`price: 14.5`, `grabfoodPrice: 19.3`) with no `priceInTwoDecimal`; item IDs
 * are numbers (coerce to string). Item->category linkage is via
 * `subCategories[0].id`. `snoozeTill` is an epoch-ms sold-out timestamp
 * (null/0 = available). Per-channel prices default to 0.0 to mean "not sold on
 * that channel". `sku` is often empty on live data — fall back to the id.
 */

export interface HubboMerchantCategory {
  /** Numeric id in live payloads; coerce to string when mapping. */
  id?: string | number
  name?: string
  desc?: string
  snoozeTill?: number | null
  /** Some payloads nest items under their category; accept both shapes. */
  items?: HubboMerchantMenuItem[]
  subCategories?: Array<{ id?: string | number; name?: string }>
}

export interface HubboMerchantAddOn {
  id?: string | number
  name?: string
  price?: number
  priceInTwoDecimal?: string
  grabfoodPrice?: number
  menuId?: string | number
  addOnCategoryId?: string | number
  singleSelect?: boolean
  maxOrder?: number | null
  sku?: string
  snoozeTill?: number | null
}

export interface HubboMerchantMenuItem {
  id?: string | number
  name?: string
  desc?: string
  shortDesc?: string
  image?: string
  /** RM decimal (e.g. 14.5 = RM 14.50) — convert to cents when mapping. */
  price?: number
  priceInTwoDecimal?: string
  /** RM decimal; 0 means not offered on GrabFood. */
  grabfoodPrice?: number | null
  foodpandaPrice?: number | null
  shopeeFoodPrice?: number | null
  gofoodPrice?: number | null
  docketName?: string | null
  printerId?: string | number
  printerId2?: string | number
  sku?: string
  snoozeTill?: number | null
  maxOrder?: number | null
  categoryId?: string | number
  /** Live linkage to the owning category: [{ id, name, desc }]. */
  subCategories?: Array<{ id?: string | number; name?: string; desc?: string }>
  addOns?: HubboMerchantAddOn[]
}

/**
 * Live /api/merchant/menu response — a flat envelope. Kept loose (many fields
 * not yet mapped) but typed for the parts we consume.
 */
export interface HubboMerchantMenuResponse {
  code?: string | number
  message?: string | null
  /** Echoed null on live responses; never a place to find the payload. */
  apiKey?: string | null
  merchant?: Record<string, unknown>
  /** Flat item list — the real source of items. */
  menu?: HubboMerchantMenuItem[]
  categories?: HubboMerchantCategory[]
  addOnCategories?: unknown[]
  promos?: unknown
  [key: string]: unknown
}

/** The mapped shape consumed by mapHubboMenuToLocal. */
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
