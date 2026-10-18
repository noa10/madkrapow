import { describe, expect, it } from 'vitest'

import {
  decideQuoteNeed,
  quoteAddressKey,
  quoteKey,
  type DecideQuoteNeedInput,
} from '../delivery-quote'

const COORDS_KEY = '3.0738,101.5183'
const ADDRESS_KEY = '12 jalan ampang||kl city|kuala lumpur|50450'

function decisionInput(overrides: Partial<DecideQuoteNeedInput> = {}): DecideQuoteNeedInput {
  return {
    deliveryType: 'delivery',
    hasAddressLine1: true,
    addressKey: ADDRESS_KEY,
    coordsKey: COORDS_KEY,
    hasQuote: true,
    quoteExpired: false,
    activeAddressKey: ADDRESS_KEY,
    activeKey: COORDS_KEY,
    status: 'ready',
    ...overrides,
  }
}

describe('quoteAddressKey', () => {
  it('normalises the address fields that are sent to the geocoder', () => {
    expect(quoteAddressKey({
      address_line1: '  12 Jalan Ampang ',
      address_line2: '',
      city: 'KL City',
      state: 'Kuala Lumpur',
      postal_code: '50450',
    })).toBe(ADDRESS_KEY)
  })

  it('treats missing fields as empty and keeps different addresses distinct', () => {
    expect(quoteAddressKey({})).toBe('||||')
    expect(quoteAddressKey({ address_line1: '1 A' })).not.toBe(
      quoteAddressKey({ address_line1: '2 B' })
    )
  })
})

describe('quoteKey', () => {
  it('builds a stable key from valid coordinates', () => {
    expect(quoteKey({ latitude: 3.0738, longitude: 101.5183 })).toBe(COORDS_KEY)
  })

  it('treats missing or non-finite coordinates as needing geocoding', () => {
    expect(quoteKey({})).toBeNull()
    expect(quoteKey({ latitude: 3.0738 })).toBeNull()
    expect(quoteKey({ latitude: null, longitude: 101.5183 })).toBeNull()
    expect(quoteKey({ latitude: Number.NaN, longitude: 101.5183 })).toBeNull()
  })
})

describe('decideQuoteNeed', () => {
  it('re-quotes across a full Delivery -> Pickup -> Delivery sequence', () => {
    expect(decideQuoteNeed(decisionInput())).toEqual({
      action: 'skip',
      reason: 'quote-fresh',
    })
    expect(decideQuoteNeed(decisionInput({ deliveryType: 'self_pickup' }))).toEqual({
      action: 'skip',
      reason: 'pickup',
    })
    expect(decideQuoteNeed(decisionInput({
      hasQuote: false,
      status: 'idle',
      activeKey: COORDS_KEY,
    }))).toEqual({ action: 'fetch', reason: 'quote-cleared' })
  })

  it('fetches after Delivery -> Pickup -> Delivery even though the old coords key survives', () => {
    // Regression for the stuck "Calculating delivery fee..." skeleton: the
    // store cleared the quote on the mode switch, but the component-level ref
    // still held the previous coords and incorrectly skipped the refetch.
    const result = decideQuoteNeed(decisionInput({
      hasQuote: false,
      status: 'idle',
      activeKey: COORDS_KEY,
    }))

    expect(result).toEqual({ action: 'fetch', reason: 'quote-cleared' })
  })

  it('skips when the same coords already have a fresh quote', () => {
    expect(decideQuoteNeed(decisionInput())).toEqual({
      action: 'skip',
      reason: 'quote-fresh',
    })
  })

  it('fetches when the stored quote has expired', () => {
    expect(decideQuoteNeed(decisionInput({ quoteExpired: true }))).toEqual({
      action: 'fetch',
      reason: 'quote-expired',
    })
  })

  it('fetches when coords are missing and need geocoding', () => {
    expect(decideQuoteNeed(decisionInput({
      coordsKey: null,
      hasQuote: false,
      activeKey: null,
      status: 'idle',
    }))).toEqual({ action: 'fetch', reason: 'no-quote' })
  })

  it('skips when there is no address line to geocode or quote', () => {
    expect(decideQuoteNeed(decisionInput({ hasAddressLine1: false }))).toEqual({
      action: 'skip',
      reason: 'no-address',
    })
  })

  it('skips a duplicate request while one for the same coords is in flight', () => {
    expect(decideQuoteNeed(decisionInput({
      hasQuote: false,
      activeKey: COORDS_KEY,
      status: 'loading',
    }))).toEqual({ action: 'skip', reason: 'in-flight' })
  })

  it('skips pickup mode even with coords and a quote present', () => {
    expect(decideQuoteNeed(decisionInput({ deliveryType: 'self_pickup' }))).toEqual({
      action: 'skip',
      reason: 'pickup',
    })
  })

  it('fetches when the address changed to new coords', () => {
    expect(decideQuoteNeed(decisionInput({ coordsKey: '3.1,101.6' }))).toEqual({
      action: 'fetch',
      reason: 'coords-changed',
    })
  })

  it('fetches when a loading request belongs to different coords', () => {
    expect(decideQuoteNeed(decisionInput({
      coordsKey: '3.1,101.6',
      hasQuote: false,
      status: 'loading',
    }))).toEqual({ action: 'fetch', reason: 'no-quote' })
  })

  it('fetches after an error when the store has no quote', () => {
    expect(decideQuoteNeed(decisionInput({
      hasQuote: false,
      status: 'error',
    }))).toEqual({ action: 'fetch', reason: 'quote-cleared' })
  })

  it('skips while the same address is still being geocoded', () => {
    expect(decideQuoteNeed(decisionInput({
      coordsKey: null,
      hasQuote: false,
      activeAddressKey: ADDRESS_KEY,
      activeKey: null,
      status: 'loading',
    }))).toEqual({ action: 'skip', reason: 'in-flight' })
  })

  it('fetches a new quote when the address changes while geocoding the old one', () => {
    // Both addresses have no coordinates yet, so `coordsKey`/`activeKey` are
    // null for both. Without the address key the old geocode would be treated
    // as an in-flight request for the new address and its response could
    // overwrite the newer delivery address.
    expect(decideQuoteNeed(decisionInput({
      addressKey: '99 other road||shah alam|selangor|40150',
      coordsKey: null,
      hasQuote: false,
      activeAddressKey: ADDRESS_KEY,
      activeKey: null,
      status: 'loading',
    }))).toEqual({ action: 'fetch', reason: 'address-changed' })
  })

  it('fetches a fresh quote when the address text changes for the same coords', () => {
    expect(decideQuoteNeed(decisionInput({
      addressKey: '99 other road||kl city|kuala lumpur|50450',
      activeAddressKey: ADDRESS_KEY,
    }))).toEqual({ action: 'fetch', reason: 'address-changed' })
  })

  it('trusts a persisted quote while the active address key is unknown', () => {
    expect(decideQuoteNeed(decisionInput({ activeAddressKey: null }))).toEqual({
      action: 'skip',
      reason: 'quote-fresh',
    })
  })
})
