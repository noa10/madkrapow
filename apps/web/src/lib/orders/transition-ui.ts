/**
 * Pure UI helpers for admin order status transitions.
 *
 * Mirrors the forward-action mapping previously inlined in the now-removed
 * `CompactOrderActions` row-action component. Kept dependency-free
 * (no React, no side effects) so it can be unit tested in the node
 * environment and reused by the extracted `useOrderStatusTransition` hook.
 */

import { differenceInMinutes, parseISO } from 'date-fns';

import {
  CANCELLABLE_STATUSES,
  TERMINAL_STATUSES,
  parseOrderStatus,
} from './status';

export interface PrimaryAction {
  label: string;
  shortLabel: string;
  nextStatus: string;
}

/** Forward-action mapping shown on the admin order actions control. */
const PRIMARY_ACTIONS: Readonly<Record<string, PrimaryAction>> = {
  pending: { label: 'Take Payment', shortLabel: 'Pay', nextStatus: 'paid' },
  paid: { label: 'Start Preparing', shortLabel: 'Prepare', nextStatus: 'preparing' },
  preparing: { label: 'Mark Ready', shortLabel: 'Ready', nextStatus: 'ready' },
};

/**
 * Resolve the primary forward action for a status, or `null` when the
 * status has no admin forward action (terminal and non-flow statuses).
 */
export function getPrimaryAction(status: string): PrimaryAction | null {
  return PRIMARY_ACTIONS[status] ?? null;
}

export interface CancelAvailability {
  canCancel: boolean;
  isTerminal: boolean;
}

/**
 * Whether the admin can cancel from this status, and whether the status is
 * terminal. Unknown wire values are treated as neither cancellable nor
 * terminal (mirrors `CompactOrderActions`).
 */
export function getCancelAvailability(status: string): CancelAvailability {
  const parsed = parseOrderStatus(status);
  return {
    canCancel: parsed !== 'unknown' && CANCELLABLE_STATUSES.has(parsed),
    isTerminal: parsed !== 'unknown' && TERMINAL_STATUSES.has(parsed),
  };
}

/** Orders younger than this should confirm before being marked ready. */
export const READY_WARNING_MINUTES = 5;

/**
 * Whether marking an order ready is early enough to warrant a confirmation
 * first — the caller should warn rather than transition immediately.
 *
 * Extracted verbatim from the inline gate in `useOrderStatusTransition` so the
 * boundary is unit-testable without React. Note the deliberate edge behaviour
 * inherited from `differenceInMinutes` truncation: exactly
 * `READY_WARNING_MINUTES` old is **not** early (5 < 5 is false), and a
 * future-dated `createdAt` (clock skew) counts as early.
 */
export function isReadyTooEarly(createdAt: string, now: Date): boolean {
  return differenceInMinutes(now, parseISO(createdAt)) < READY_WARNING_MINUTES;
}
