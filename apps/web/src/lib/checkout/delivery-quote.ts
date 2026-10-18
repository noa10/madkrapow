export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'error'

export type QuoteFetchReason =
  | 'no-quote'
  | 'coords-changed'
  | 'address-changed'
  | 'quote-expired'
  | 'quote-cleared'

export type QuoteSkipReason = 'pickup' | 'no-address' | 'in-flight' | 'quote-fresh'

export type QuoteDecision =
  | { action: 'skip'; reason: QuoteSkipReason }
  | { action: 'fetch'; reason: QuoteFetchReason }

export interface DecideQuoteNeedInput {
  deliveryType: 'delivery' | 'self_pickup'
  hasAddressLine1: boolean
  /** Stable identity of the address fields sent to the geocoder/quote API. */
  addressKey: string
  coordsKey: string | null
  hasQuote: boolean
  quoteExpired: boolean
  /** The address key of the request/quote currently tracked, if any. */
  activeAddressKey: string | null
  activeKey: string | null
  status: QuoteStatus
}

interface QuoteCoords {
  latitude?: number | null
  longitude?: number | null
}

interface QuoteAddressFields {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

/**
 * Stable identity for the address text a geocode/quote request was made for.
 *
 * Coordinates alone cannot identify a request while geocoding: two different
 * addresses both have `quoteKey(...) === null`. Comparing this key lets the
 * checkout page abort an in-flight geocode when the user picks another address
 * instead of letting the old response overwrite the newer one.
 */
export function quoteAddressKey(address: QuoteAddressFields): string {
  return [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
  ]
    .map((part) => (part ?? '').trim().toLowerCase())
    .join('|')
}

/**
 * Stable identity for the coordinates a quote belongs to.
 *
 * Returns null when either coordinate is missing so callers can tell the
 * difference between "same place" and "still needs geocoding".
 */
export function quoteKey(coords: QuoteCoords): string | null {
  const { latitude, longitude } = coords
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return `${latitude},${longitude}`
}

function fetchReason(input: DecideQuoteNeedInput): QuoteFetchReason {
  const { addressKey, activeAddressKey, coordsKey, hasQuote, quoteExpired, activeKey } = input
  const keyMatches = coordsKey !== null && coordsKey === activeKey
  const sameAddress = activeAddressKey === null || activeAddressKey === addressKey

  if (!hasQuote) {
    // The request guard still knows the previous coords, but the store no
    // longer holds a quote (e.g. Delivery -> Pickup -> Delivery cleared it).
    // That is precisely when a refetch is required.
    return keyMatches ? 'quote-cleared' : 'no-quote'
  }
  if (quoteExpired) return 'quote-expired'
  if (!sameAddress) return 'address-changed'
  if (coordsKey === null) return 'no-quote'
  if (coordsKey !== activeKey) return 'coords-changed'
  return 'no-quote'
}

/**
 * Decide whether the checkout page needs to request a delivery quote.
 *
 * This is deliberately pure: the store remains the only source of truth for
 * quote data, and refs may only be used to recognise the coords/address a
 * request or quote belongs to — never as proof that a quote still exists.
 */
export function decideQuoteNeed(input: DecideQuoteNeedInput): QuoteDecision {
  const {
    deliveryType,
    hasAddressLine1,
    addressKey,
    coordsKey,
    hasQuote,
    quoteExpired,
    activeAddressKey,
    activeKey,
    status,
  } = input

  if (deliveryType !== 'delivery') return { action: 'skip', reason: 'pickup' }
  if (!hasAddressLine1) return { action: 'skip', reason: 'no-address' }

  const sameAddress = activeAddressKey === null || activeAddressKey === addressKey

  // While geocoding, every in-flight request has `coordsKey === null`; only
  // the address key distinguishes "same address" from "the user picked a new
  // one". A changed address must abort/refetch rather than skip as in-flight.
  if (status === 'loading' && !sameAddress) {
    return { action: 'fetch', reason: 'address-changed' }
  }

  // A request for these exact coords is already in flight.
  if (status === 'loading' && coordsKey === activeKey) {
    return { action: 'skip', reason: 'in-flight' }
  }

  if (
    coordsKey !== null &&
    hasQuote &&
    !quoteExpired &&
    coordsKey === activeKey &&
    sameAddress
  ) {
    return { action: 'skip', reason: 'quote-fresh' }
  }

  return { action: 'fetch', reason: fetchReason(input) }
}
