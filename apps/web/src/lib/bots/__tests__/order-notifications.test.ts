import { describe, it, expect } from 'vitest'
import { getStatusMessage } from '../order-notifications'

describe('order-notifications allowlist', () => {
  it('fires for the five notify statuses', () => {
    expect(getStatusMessage('MK-001', 'preparing')).toMatch(/being prepared/)
    expect(getStatusMessage('MK-001', 'ready')).toMatch(/ready for/)
    expect(getStatusMessage('MK-001', 'picked_up')).toMatch(/picked up/)
    expect(getStatusMessage('MK-001', 'delivered')).toMatch(/delivered/)
    expect(getStatusMessage('MK-001', 'cancelled')).toMatch(/cancelled/)
  })

  it('suppresses pending/paid/accepted explicitly', () => {
    expect(getStatusMessage('MK-001', 'pending')).toBeNull()
    expect(getStatusMessage('MK-001', 'paid')).toBeNull()
    expect(getStatusMessage('MK-001', 'accepted')).toBeNull()
  })

  it('returns null for an unknown status without throwing', () => {
    expect(getStatusMessage('MK-001', 'mystery_status')).toBeNull()
    expect(getStatusMessage('MK-001', '')).toBeNull()
  })

  it('embeds the order number into the message', () => {
    expect(getStatusMessage('MK-007', 'delivered')).toContain('MK-007')
  })
})
