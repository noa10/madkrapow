export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'error'

export type QuoteFetchReason =
  | 'no-quote'
  | 'coords-changed'
  | 'quote-expired'
  | 'quote-cleared'

export type QuoteSkipReason = 'pickup' | 'no-address' | 'in-flight' | 'quote-fresh'

export type QuoteDecision =
  | { action: 'skip'; reason: QuoteSkipReason }
  | { action: 'fetch'; reason: QuoteFetchReason }

export interface DecideQuoteNeedInput {
  deliveryType: 'delivery' | 'self_pickup'
  hasAddressLine1: boolean
  coordsKey: string | null
  hasQuote: boolean
  quoteExpired: boolean
  activeKey: string | null
  status: QuoteStatus
}

interface QuoteCoords {
  latitude?: number | null
  longitude?: number | null
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
  const { coordsKey, hasQuote, quoteExpired, activeKey } = input
  const keyMatches = coordsKey !== null && coordsKey === activeKey

  if (!hasQuote) {
    // The request guard still knows the previous coords, but the store no
    // longer holds a quote (e.g. Delivery -> Pickup -> Delivery cleared it).
    // That is precisely when a refetch is required.
    return keyMatches ? 'quote-cleared' : 'no-quote'
  }
  if (quoteExpired) return 'quote-expired'
  if (coordsKey === null) return 'no-quote'
  if (coordsKey !== activeKey) return 'coords-changed'
  return 'no-quote'
}

/**
 * Decide whether the checkout page needs to request a delivery quote.
 *
 * This is deliberately pure: the store remains the only source of truth for
 * quote data, and a ref may only be used to recognise the coords a request or
 * quote belongs to — never as proof that a quote still exists.
 */
export function decideQuoteNeed(input: DecideQuoteNeedInput): QuoteDecision {
  const { deliveryType, hasAddressLine1, coordsKey, hasQuote, quoteExpired, activeKey, status } = input

  if (deliveryType !== 'delivery') return { action: 'skip', reason: 'pickup' }
  if (!hasAddressLine1) return { action: 'skip', reason: 'no-address' }

  // A request for these exact coords is already in flight.
  if (status === 'loading' && coordsKey === activeKey) {
    return { action: 'skip', reason: 'in-flight' }
  }

  if (coordsKey !== null && hasQuote && !quoteExpired && coordsKey === activeKey) {
    return { action: 'skip', reason: 'quote-fresh' }
  }

  return { action: 'fetch', reason: fetchReason(input) }
}
