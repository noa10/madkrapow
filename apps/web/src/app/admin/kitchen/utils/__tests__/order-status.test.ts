import { describe, it, expect } from 'vitest'
import { ACTIVE_STATUSES, STATUS_CONFIG, statusConfigFor } from '../order-status'

describe('statusConfigFor', () => {
  it('gives every status the kitchen fetches its own label', () => {
    // The regression this pins: 'accepted' was missing from the map, so
    // accepted orders silently rendered with the Pending label and colour.
    for (const status of ACTIVE_STATUSES) {
      expect(
        STATUS_CONFIG[status],
        `no STATUS_CONFIG entry for active status "${status}"`
      ).toBeDefined()
    }
  })

  it('labels accepted orders as Accepted, not Pending', () => {
    expect(statusConfigFor('accepted').label).toBe('Accepted')
    expect(statusConfigFor('accepted')).not.toEqual(statusConfigFor('pending'))
  })

  it('resolves each active status to a distinct label', () => {
    const labels = ACTIVE_STATUSES.map((s) => statusConfigFor(s).label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('falls back to pending for an unknown status', () => {
    expect(statusConfigFor('something-new')).toEqual(STATUS_CONFIG.pending)
  })

  it('still covers the terminal statuses', () => {
    for (const status of ['delivering', 'completed', 'cancelled']) {
      expect(STATUS_CONFIG[status]).toBeDefined()
    }
  })
})
