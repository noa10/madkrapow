import { describe, it, expect } from 'vitest'
import {
  mapV3StatusToDispatch,
  mapDispatchToOrderStatus,
  isTerminalStatus,
  isValidStatusTransition,
} from '../status-mapper'
import type { LalamoveOrderStatus } from '../types'

describe('mapV3StatusToDispatch', () => {
  it('maps ASSIGNING_DRIVER to driver_pending', () => {
    expect(mapV3StatusToDispatch('ASSIGNING_DRIVER')).toBe('driver_pending')
  })

  it('maps ON_GOING to driver_assigned', () => {
    expect(mapV3StatusToDispatch('ON_GOING')).toBe('driver_assigned')
  })

  it('maps PICKED_UP to in_transit', () => {
    expect(mapV3StatusToDispatch('PICKED_UP')).toBe('in_transit')
  })

  it('maps COMPLETED to delivered', () => {
    expect(mapV3StatusToDispatch('COMPLETED')).toBe('delivered')
  })

  it('maps CANCELED to cancelled', () => {
    expect(mapV3StatusToDispatch('CANCELED')).toBe('cancelled')
  })

  it('maps REJECTED to manual_review', () => {
    expect(mapV3StatusToDispatch('REJECTED')).toBe('manual_review')
  })

  it('maps EXPIRED to failed', () => {
    expect(mapV3StatusToDispatch('EXPIRED')).toBe('failed')
  })

  it('maps unknown status to manual_review', () => {
    expect(mapV3StatusToDispatch('UNKNOWN' as LalamoveOrderStatus)).toBe('manual_review')
  })
})

describe('mapDispatchToOrderStatus', () => {
  it('maps in_transit to picked_up', () => {
    expect(mapDispatchToOrderStatus('in_transit')).toBe('picked_up')
  })

  it('maps delivered to delivered', () => {
    expect(mapDispatchToOrderStatus('delivered')).toBe('delivered')
  })

  it('returns null for driver_pending', () => {
    expect(mapDispatchToOrderStatus('driver_pending')).toBeNull()
  })

  it('returns null for driver_assigned', () => {
    expect(mapDispatchToOrderStatus('driver_assigned')).toBeNull()
  })

  it('returns null for quoted', () => {
    expect(mapDispatchToOrderStatus('quoted')).toBeNull()
  })

  it('returns null for failed', () => {
    expect(mapDispatchToOrderStatus('failed')).toBeNull()
  })

  it('returns null for cancelled', () => {
    expect(mapDispatchToOrderStatus('cancelled')).toBeNull()
  })

  it('returns null for manual_review', () => {
    expect(mapDispatchToOrderStatus('manual_review')).toBeNull()
  })
})

describe('isTerminalStatus', () => {
  it('returns true for delivered', () => {
    expect(isTerminalStatus('delivered')).toBe(true)
  })

  it('returns true for cancelled', () => {
    expect(isTerminalStatus('cancelled')).toBe(true)
  })

  it('returns true for failed', () => {
    expect(isTerminalStatus('failed')).toBe(true)
  })

  it('returns false for quoted', () => {
    expect(isTerminalStatus('quoted')).toBe(false)
  })

  it('returns false for driver_pending', () => {
    expect(isTerminalStatus('driver_pending')).toBe(false)
  })

  it('returns false for driver_assigned', () => {
    expect(isTerminalStatus('driver_assigned')).toBe(false)
  })

  it('returns false for in_transit', () => {
    expect(isTerminalStatus('in_transit')).toBe(false)
  })

  it('returns false for manual_review', () => {
    expect(isTerminalStatus('manual_review')).toBe(false)
  })
})

describe('isValidStatusTransition', () => {
  describe('normal forward progression', () => {
    it('allows quoted → driver_pending', () => {
      expect(isValidStatusTransition('quoted', 'driver_pending')).toBe(true)
    })

    it('allows driver_pending → driver_assigned', () => {
      expect(isValidStatusTransition('driver_pending', 'driver_assigned')).toBe(true)
    })

    it('allows driver_assigned → in_transit', () => {
      expect(isValidStatusTransition('driver_assigned', 'in_transit')).toBe(true)
    })

    it('allows in_transit → delivered', () => {
      expect(isValidStatusTransition('in_transit', 'delivered')).toBe(true)
    })
  })

  describe('backward transitions are blocked', () => {
    it('blocks driver_assigned → quoted (arbitrary backward)', () => {
      expect(isValidStatusTransition('driver_assigned', 'quoted')).toBe(false)
    })

    it('blocks in_transit → driver_assigned (skips revert step)', () => {
      expect(isValidStatusTransition('in_transit', 'driver_assigned')).toBe(false)
    })

    it('blocks in_transit → quoted (arbitrary backward)', () => {
      expect(isValidStatusTransition('in_transit', 'quoted')).toBe(false)
    })

    it('blocks delivered → in_transit', () => {
      expect(isValidStatusTransition('delivered', 'in_transit')).toBe(false)
    })
  })

  describe('forward skips are allowed (concurrent webhooks)', () => {
    it('allows quoted → driver_assigned (skips driver_pending)', () => {
      expect(isValidStatusTransition('quoted', 'driver_assigned')).toBe(true)
    })

    it('allows driver_pending → in_transit (skips driver_assigned)', () => {
      expect(isValidStatusTransition('driver_pending', 'in_transit')).toBe(true)
    })

    it('allows quoted → delivered (late COMPLETED after snapshot)', () => {
      expect(isValidStatusTransition('quoted', 'delivered')).toBe(true)
    })

    it('allows driver_assigned → delivered (the race that stuck order 98df443a)', () => {
      expect(isValidStatusTransition('driver_assigned', 'delivered')).toBe(true)
    })
  })

  describe('Lalamove driver-rejection reverts are allowed', () => {
    it('allows driver_assigned → driver_pending (driver rejected during ON_GOING)', () => {
      expect(isValidStatusTransition('driver_assigned', 'driver_pending')).toBe(true)
    })

    it('allows in_transit → driver_pending (driver rejected during PICKED_UP)', () => {
      expect(isValidStatusTransition('in_transit', 'driver_pending')).toBe(true)
    })

    it('allows driver_pending → driver_pending (duplicate ASSIGNING_DRIVER webhook)', () => {
      expect(isValidStatusTransition('driver_pending', 'driver_pending')).toBe(true)
    })

    it('does NOT allow arbitrary same-state transitions outside the revert allowlist', () => {
      expect(isValidStatusTransition('driver_assigned', 'driver_assigned')).toBe(false)
      expect(isValidStatusTransition('in_transit', 'in_transit')).toBe(false)
    })
  })

  describe('terminal states are immutable', () => {
    it('blocks delivered → anything', () => {
      expect(isValidStatusTransition('delivered', 'driver_pending')).toBe(false)
      expect(isValidStatusTransition('delivered', 'cancelled')).toBe(false)
    })

    it('blocks failed → anything', () => {
      expect(isValidStatusTransition('failed', 'driver_pending')).toBe(false)
    })

    it('blocks cancelled → anything', () => {
      expect(isValidStatusTransition('cancelled', 'driver_pending')).toBe(false)
    })
  })

  describe('error handling transitions', () => {
    it('allows any non-terminal → failed', () => {
      expect(isValidStatusTransition('quoted', 'failed')).toBe(true)
      expect(isValidStatusTransition('driver_pending', 'failed')).toBe(true)
      expect(isValidStatusTransition('driver_assigned', 'failed')).toBe(true)
      expect(isValidStatusTransition('in_transit', 'failed')).toBe(true)
    })

    it('allows any non-terminal → cancelled', () => {
      expect(isValidStatusTransition('quoted', 'cancelled')).toBe(true)
      expect(isValidStatusTransition('driver_pending', 'cancelled')).toBe(true)
    })

    it('allows any non-terminal → manual_review', () => {
      expect(isValidStatusTransition('quoted', 'manual_review')).toBe(true)
      expect(isValidStatusTransition('driver_pending', 'manual_review')).toBe(true)
    })
  })

  describe('retry from manual_review', () => {
    it('allows manual_review → driver_pending', () => {
      expect(isValidStatusTransition('manual_review', 'driver_pending')).toBe(true)
    })

    it('blocks manual_review → driver_assigned', () => {
      expect(isValidStatusTransition('manual_review', 'driver_assigned')).toBe(false)
    })
  })
})
