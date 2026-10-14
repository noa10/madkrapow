import { describe, it, expect } from 'vitest';
import {
  getPrimaryAction,
  getCancelAvailability,
  isReadyTooEarly,
  READY_WARNING_MINUTES,
} from '../transition-ui';
import { ORDER_STATUSES } from '../status';

describe('getPrimaryAction', () => {
  it('maps pending to Take Payment / Pay / paid', () => {
    expect(getPrimaryAction('pending')).toEqual({
      label: 'Take Payment',
      shortLabel: 'Pay',
      nextStatus: 'paid',
    });
  });

  it('maps paid to Start Preparing / Prepare / preparing', () => {
    expect(getPrimaryAction('paid')).toEqual({
      label: 'Start Preparing',
      shortLabel: 'Prepare',
      nextStatus: 'preparing',
    });
  });

  it('maps preparing to Mark Ready / Ready / ready', () => {
    expect(getPrimaryAction('preparing')).toEqual({
      label: 'Mark Ready',
      shortLabel: 'Ready',
      nextStatus: 'ready',
    });
  });

  it('returns null for statuses with no forward admin action', () => {
    for (const status of ['accepted', 'ready', 'picked_up', 'delivered', 'cancelled']) {
      expect(getPrimaryAction(status)).toBeNull();
    }
  });

  it('returns null for unknown / drift values', () => {
    expect(getPrimaryAction('unknown')).toBeNull();
    expect(getPrimaryAction('mystery_status')).toBeNull();
    expect(getPrimaryAction('')).toBeNull();
  });

  it('has a forward action for exactly pending, paid and preparing', () => {
    const withAction = ORDER_STATUSES.filter((s) => getPrimaryAction(s) !== null);
    expect([...withAction]).toEqual(['pending', 'paid', 'preparing']);
  });
});

describe('getCancelAvailability', () => {
  it('allows cancel and is non-terminal for cancellable statuses', () => {
    for (const status of ['pending', 'paid', 'accepted', 'preparing', 'ready']) {
      expect(getCancelAvailability(status)).toEqual({
        canCancel: true,
        isTerminal: false,
      });
    }
  });

  it('is terminal and not cancellable for delivered and cancelled', () => {
    for (const status of ['delivered', 'cancelled']) {
      expect(getCancelAvailability(status)).toEqual({
        canCancel: false,
        isTerminal: true,
      });
    }
  });

  it('is neither cancellable nor terminal for picked_up', () => {
    expect(getCancelAvailability('picked_up')).toEqual({
      canCancel: false,
      isTerminal: false,
    });
  });

  it('treats unknown values as neither cancellable nor terminal', () => {
    expect(getCancelAvailability('unknown')).toEqual({
      canCancel: false,
      isTerminal: false,
    });
    expect(getCancelAvailability('out_for_delivery')).toEqual({
      canCancel: false,
      isTerminal: false,
    });
  });

  it('partitions every status into cancellable XOR terminal XOR neither', () => {
    for (const status of ORDER_STATUSES) {
      const { canCancel, isTerminal } = getCancelAvailability(status);
      expect(canCancel && isTerminal).toBe(false);
    }
  });
});

describe('isReadyTooEarly', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MINUTE = 60_000;

  it('warns for an order created seconds ago', () => {
    expect(isReadyTooEarly(ago(5_000), now)).toBe(true);
  });

  it('warns for an order just under the threshold', () => {
    expect(isReadyTooEarly(ago(4 * MINUTE + 59_000), now)).toBe(true);
  });

  it('does not warn at exactly the threshold', () => {
    expect(isReadyTooEarly(ago(READY_WARNING_MINUTES * MINUTE), now)).toBe(false);
  });

  it('does not warn past the threshold', () => {
    expect(isReadyTooEarly(ago(5 * MINUTE + 30_000), now)).toBe(false);
    expect(isReadyTooEarly(ago(30 * MINUTE), now)).toBe(false);
    expect(isReadyTooEarly(ago(24 * 60 * MINUTE), now)).toBe(false);
  });

  it('treats a future-dated createdAt (clock skew) as early', () => {
    expect(isReadyTooEarly(new Date(now.getTime() + MINUTE).toISOString(), now)).toBe(true);
  });

  it('does not warn for an unparseable timestamp', () => {
    expect(isReadyTooEarly('not-a-date', now)).toBe(false);
    expect(isReadyTooEarly('', now)).toBe(false);
  });

  it('keeps the warning window at 5 minutes', () => {
    expect(READY_WARNING_MINUTES).toBe(5);
  });
});
