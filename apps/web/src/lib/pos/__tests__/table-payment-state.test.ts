import { describe, expect, it } from 'vitest'
import {
  INITIAL_TABLE_PAYMENT_STATE,
  nextTablePaymentState,
  type TablePaymentState,
} from '../table-payment-state'

function state(overrides: Partial<TablePaymentState> = {}): TablePaymentState {
  return { ...INITIAL_TABLE_PAYMENT_STATE, ...overrides }
}

describe('nextTablePaymentState', () => {
  it('confirms the order only after a successful read says it is still payable', () => {
    const next = nextTablePaymentState(state(), { type: 'read', payable: true })
    expect(next).toEqual({ payable: true, confirmed: true, blocked: false })
  })

  it('drops the confirmation when a read says the order is no longer payable', () => {
    // The ledger says the money moved: the QR must go, and the block stays
    // whatever it was.
    const next = nextTablePaymentState(state({ confirmed: true }), {
      type: 'read',
      payable: false,
    })
    expect(next).toEqual({ payable: false, confirmed: false, blocked: false })
  })

  it('clears the block when a read proves the order is still payable', () => {
    // The server just said the order is payable, so an older "can never be
    // paid" no longer holds.
    const next = nextTablePaymentState(state({ blocked: true }), {
      type: 'read',
      payable: true,
    })
    expect(next.blocked).toBe(false)
  })

  it('keeps the block when a read says the order is not payable', () => {
    const next = nextTablePaymentState(state({ blocked: true }), {
      type: 'read',
      payable: false,
    })
    expect(next.blocked).toBe(true)
  })

  it('drops the confirmation when a read fails', () => {
    // A failed read proves nothing. Keeping the confirmation would leave a
    // scannable DuitNow code on an order the cashier may have settled.
    const next = nextTablePaymentState(state({ payable: true, confirmed: true }), {
      type: 'read_failed',
    })
    expect(next).toEqual({ payable: true, confirmed: false, blocked: false })
  })

  it('blocks the order when the read after a lost claim failed', () => {
    const next = nextTablePaymentState(state({ confirmed: true }), {
      type: 'read_unconfirmed',
    })
    expect(next).toEqual({ payable: false, confirmed: false, blocked: true })
  })

  it('blocks the order when the claim was refused', () => {
    for (const type of ['claim_conflict', 'claim_not_found'] as const) {
      const next = nextTablePaymentState(state({ confirmed: true }), { type })
      expect(next).toEqual({ payable: false, confirmed: false, blocked: true })
    }
  })

  it('closes the order when the claim was recorded', () => {
    const next = nextTablePaymentState(state({ confirmed: true, blocked: true }), {
      type: 'claim_succeeded',
    })
    expect(next).toEqual({ payable: false, confirmed: false, blocked: false })
  })

  it('makes the diner earn the QR again when the payment step is entered', () => {
    // The defect this exists for: entering the payment step used to hand the
    // diner a QR without a read, and used to clear the server's block.
    const next = nextTablePaymentState(state({ payable: true, confirmed: true }), {
      type: 'payment_step_entered',
    })
    expect(next.confirmed).toBe(false)
    expect(next.payable).toBe(true)
  })

  it('keeps the server block when the payment step is entered', () => {
    // A server that said "this can never be paid" keeps its say.
    const next = nextTablePaymentState(state({ blocked: true }), {
      type: 'payment_step_entered',
    })
    expect(next.blocked).toBe(true)
  })

  it('drops the confirmation when the diner leaves the payment step', () => {
    const next = nextTablePaymentState(state({ confirmed: true }), {
      type: 'payment_step_left',
    })
    expect(next.confirmed).toBe(false)
  })

  it('never confirms an order from a create response', () => {
    // A create response may be a replay of an order created minutes ago and
    // paid since: it sets the last known state, never the confirmation.
    const next = nextTablePaymentState(state({ confirmed: true }), {
      type: 'order_created',
      payable: true,
    })
    expect(next).toEqual({ payable: true, confirmed: false, blocked: false })
  })

  it('forgets everything when a new round starts', () => {
    const next = nextTablePaymentState(
      state({ payable: true, confirmed: true, blocked: true }),
      { type: 'new_order' }
    )
    expect(next).toEqual({ payable: false, confirmed: false, blocked: false })
  })
})
