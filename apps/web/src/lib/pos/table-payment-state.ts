/**
 * The payment-confirmation state machine for the customer table-QR page.
 *
 * Pure transitions only — no React, no Supabase — so the rules that decide
 * whether a diner may be told to hand over money are unit-tested away from
 * the component that renders them.
 *
 * The state has three parts, and the difference between them is the whole
 * point:
 *
 * - `payable` — the last known state ("this order may still be paid from the
 *   phone"). It can be stale: the cashier may have settled the order in cash
 *   since the last read.
 * - `confirmed` — a *successful server read* confirmed, on this screen, that
 *   the order is still pending and unpaid. Only this one may put the payment
 *   QR on the screen.
 * - `blocked` — the server said this order can never be paid from the phone.
 *
 * "Not blocked" is not "confirmed payable". A failed read proves nothing, and
 * a scannable DuitNow code on an order the cashier already settled in cash is
 * a second transfer out of the diner's own pocket. So every rule below fails
 * closed: a confirmation is earned by a read and lost by anything that is not
 * one.
 */

/** What the client believes about paying this order from the phone. */
export interface TablePaymentState {
  /** The order may still be paid from the phone (last known, can be stale). */
  payable: boolean
  /**
   * A successful server read confirmed the order is still pending and unpaid.
   *
   * This is the only thing that may put the payment QR on the screen.
   */
  confirmed: boolean
  /** The server said this order can never be paid from the phone. */
  blocked: boolean
}

/** The state of an order that has just been opened: nothing is known yet. */
export const INITIAL_TABLE_PAYMENT_STATE: TablePaymentState = {
  payable: false,
  confirmed: false,
  blocked: false,
}

/**
 * Everything that can change what the client believes about the payment.
 *
 * Each event is one thing the server (or the diner) told us; the transition
 * table in `nextTablePaymentState` is the only place that decides what that
 * means for the screen.
 */
export type TablePaymentEvent =
  /**
   * A status read came back and the order is still pending with no succeeded
   * payment row (`payable: true`), or it is not (`payable: false`).
   */
  | { type: 'read'; payable: boolean }
  /**
   * A status read failed (offline, rate-limited, 5xx, unreadable body).
   *
   * Nothing is proven, so the confirmation is dropped. The order may still be
   * payable; the next successful read brings the confirmation back.
   */
  | { type: 'read_failed' }
  /**
   * A status read failed right after a claim whose answer was lost.
   *
   * The claim may have landed, so the order is treated as not payable from
   * the phone until the server says otherwise.
   */
  | { type: 'read_unconfirmed' }
  /** The claim was refused: the order is not pending (409). */
  | { type: 'claim_conflict' }
  /** The claim was refused: the order (or this diner's claim key) is unknown (404). */
  | { type: 'claim_not_found' }
  /** The claim was recorded (or the order was already paid). */
  | { type: 'claim_succeeded' }
  /** The diner opened the payment step; the confirmation must be re-earned. */
  | { type: 'payment_step_entered' }
  /** The diner left the payment step; the confirmation does not travel with it. */
  | { type: 'payment_step_left' }
  /** The order was created (or the create was replayed). */
  | { type: 'order_created'; payable: boolean }
  /** The diner started a new round; the previous order is finished. */
  | { type: 'new_order' }

/**
 * The next state for a payment event.
 *
 * The rules, one per event:
 *
 * - A successful read is the only thing that confirms the order. A payable
 *   read also clears the block: the server just said the order is still
 *   payable, so an older "can never be paid" no longer holds.
 * - A failed read drops the confirmation and keeps everything else. A read
 *   that proves nothing must not silently keep a money instruction alive —
 *   and it must not block the order either; the next good read decides.
 * - A claim that was refused settles the question: the order is not payable
 *   from this phone, and the screen says so.
 * - Entering the payment step clears the confirmation on purpose: the QR is
 *   shown only after a read that happened *while the diner is looking at it*.
 * - The block is deliberately NOT cleared when the payment step is entered: a
 *   server that said "this can never be paid" keeps its say until a read says
 *   otherwise.
 */
export function nextTablePaymentState(
  state: TablePaymentState,
  event: TablePaymentEvent
): TablePaymentState {
  switch (event.type) {
    case 'read':
      return event.payable
        ? { payable: true, confirmed: true, blocked: false }
        : { payable: false, confirmed: false, blocked: state.blocked }

    case 'read_failed':
      return { ...state, confirmed: false }

    case 'read_unconfirmed':
      return { payable: false, confirmed: false, blocked: true }

    case 'claim_conflict':
    case 'claim_not_found':
      return { payable: false, confirmed: false, blocked: true }

    case 'claim_succeeded':
      return { payable: false, confirmed: false, blocked: false }

    case 'payment_step_entered':
    case 'payment_step_left':
      return { ...state, confirmed: false }

    case 'order_created':
      // A create response is not a status read: it may be a replay of an
      // order that was created minutes ago and paid since. It may set the
      // last known state, never the confirmation.
      return { ...state, payable: event.payable, confirmed: false }

    case 'new_order':
      return { payable: false, confirmed: false, blocked: false }
  }
}
