import { describe, expect, it } from 'vitest'
import { eventKeyFor, redactGrabPayload, stableStringify } from '../redact'

describe('redactGrabPayload', () => {
  it('removes phone numbers, addresses and virtual contact details but keeps the name', () => {
    const payload = {
      orderID: 'o-1',
      receiver: {
        name: 'Ali',
        phones: '+60123456789',
        address: {
          address: '1 Jalan Test',
          unitNumber: '3-45',
          postcode: 12345,
          coordinates: { latitude: 1.2, longitude: 3.4 },
        },
        virtualContact: { phoneNumber: '+60123456789', PIN: 1234 },
      },
    }
    const redacted = redactGrabPayload(payload)
    expect(redacted.receiver.name).toBe('Ali')
    expect(redacted.receiver).not.toHaveProperty('phones')
    expect(redacted.receiver).not.toHaveProperty('address')
    expect(redacted.receiver).not.toHaveProperty('virtualContact')
  })
})

describe('eventKeyFor', () => {
  it('dedupes identical payloads regardless of key order', () => {
    const a = { orderID: 'o-1', state: 'COLLECTED', message: null }
    const b = { state: 'COLLECTED', message: null, orderID: 'o-1' }
    expect(stableStringify(a)).toBe(stableStringify(b))
    expect(eventKeyFor('order_state', a, 'o-1')).toBe(eventKeyFor('order_state', b, 'o-1'))
  })

  it('changes when the payload changes (edited order)', () => {
    const base = { orderID: 'o-1', items: [{ id: 'i-1', quantity: 1, price: 100 }] }
    const edited = { orderID: 'o-1', items: [{ id: 'i-1', quantity: 2, price: 100 }] }
    expect(eventKeyFor('submit_order', base, 'o-1')).not.toBe(
      eventKeyFor('submit_order', edited, 'o-1')
    )
  })
})
