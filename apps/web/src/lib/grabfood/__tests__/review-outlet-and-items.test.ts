import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GrabSubmitOrderPayload } from '../types'
import { mapGrabSubmitOrder } from '../mapper'

vi.mock('@/lib/validators/env', () => ({ env: { GRABFOOD_MERCHANT_ID: 'configured' } }))
import { validateOutlet, validatePersistedOutlet } from '../guard'

function db(rows: unknown[], error: unknown = null): SupabaseClient {
  return { from: () => ({ select: () => ({ limit: async () => ({ data: rows, error }) }) }) } as unknown as SupabaseClient
}

describe('established outlet identity', () => {
  it('never bypasses a configured merchant during discovery', () => {
    expect(validateOutlet({ merchantID: 'other' }, { allowUnknownMerchant: true }).ok).toBe(false)
  })
  it('rejects a conflicting saved partner or merchant and fails closed on read errors', async () => {
    const saved = db([{ partner_merchant_id: 'pos', grab_merchant_id: 'configured' }])
    expect((await validatePersistedOutlet(saved, { merchantID: 'configured', partnerMerchantID: 'wrong' })).ok).toBe(false)
    expect((await validatePersistedOutlet(saved, { merchantID: 'configured', partnerMerchantID: 'pos' })).ok).toBe(true)
    expect((await validatePersistedOutlet(db([], new Error('db')), { merchantID: 'configured' })).ok).toBe(false)
  })
})

describe('readable order items', () => {
  const payload = { orderID: 'o', merchantID: 'm', items: [{ id: 'dish', price: 100, modifiers: [{ id: 'egg', quantity: 2 }] }] } as GrabSubmitOrderPayload
  const mappings = new Map([['dish', { external_item_id: 'dish', menu_item_id: 'local', external_name: null, menu_items: { name: 'Basil rice' } }]])
  it('uses local dish and modifier names', () => {
    const result = mapGrabSubmitOrder(payload, mappings, 'order', new Map([['egg', 'Extra egg']]))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.result.items[0]).toMatchObject({ menu_item_name: 'Basil rice', notes: '2x Extra egg' })
  })
  it('rejects unresolved modifiers instead of printing an opaque ID', () => {
    const result = mapGrabSubmitOrder(payload, mappings, 'order')
    expect(result).toEqual({ ok: false, unmapped: ['modifier: egg'] })
  })
})
