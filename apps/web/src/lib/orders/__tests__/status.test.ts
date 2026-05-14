import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUSES,
  STATUS_LABELS,
  ADMIN_STATUS_LABELS,
  STATUS_COLORS,
  STATUS_FLOW_STEPS,
  TERMINAL_STATUSES,
  CANCELLABLE_STATUSES,
  VALID_FORWARD_TRANSITIONS,
  ADMIN_VALID_TRANSITIONS,
  NOTIFY_STATUSES,
  ADMIN_TAB_STATUSES,
  TAILWIND_CLASSES_BY_ROLE,
  DISPATCH_STATUS_MESSAGES,
  parseOrderStatus,
  customerLabel,
  adminLabel,
  colorRoleFor,
  tailwindClassesFor,
  isTerminal,
  isCancellable,
  isCompleted,
  SPEC_CANONICAL_STATUSES,
  type OrderStatus,
} from '../status';

describe('order status — shared module', () => {
  it('ORDER_STATUSES matches the schema CHECK constraint and the JSON spec', () => {
    expect([...ORDER_STATUSES]).toEqual([
      'pending',
      'paid',
      'accepted',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
      'cancelled',
    ]);
    expect([...ORDER_STATUSES]).toEqual([...SPEC_CANONICAL_STATUSES]);
  });

  it('STATUS_LABELS and ADMIN_STATUS_LABELS cover every status', () => {
    for (const s of ORDER_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(ADMIN_STATUS_LABELS[s]).toBeTruthy();
    }
  });

  it('STATUS_COLORS uses only valid color roles', () => {
    const validRoles = new Set([
      'primary',
      'success',
      'info',
      'warning',
      'danger',
      'neutral',
    ]);
    for (const s of ORDER_STATUSES) {
      expect(validRoles.has(STATUS_COLORS[s])).toBe(true);
    }
  });

  it('STATUS_FLOW_STEPS does NOT contain accepted', () => {
    expect((STATUS_FLOW_STEPS as readonly string[]).includes('accepted')).toBe(
      false,
    );
  });

  it('STATUS_FLOW_STEPS starts at pending and ends at delivered (Q3 resolved)', () => {
    expect(STATUS_FLOW_STEPS[0]).toBe('pending');
    expect(STATUS_FLOW_STEPS[STATUS_FLOW_STEPS.length - 1]).toBe('delivered');
    expect(STATUS_FLOW_STEPS.length).toBe(6);
  });

  it('TERMINAL_STATUSES == {delivered, cancelled}', () => {
    expect([...TERMINAL_STATUSES].sort()).toEqual(['cancelled', 'delivered']);
  });

  it('CANCELLABLE_STATUSES is a subset of statuses with cancelled forward target', () => {
    const fromTransitions = new Set<string>();
    for (const s of ORDER_STATUSES) {
      if ((VALID_FORWARD_TRANSITIONS[s] as readonly string[]).includes('cancelled')) {
        fromTransitions.add(s);
      }
    }
    for (const s of CANCELLABLE_STATUSES) {
      expect(fromTransitions.has(s)).toBe(true);
    }
    expect(CANCELLABLE_STATUSES.size).toBe(fromTransitions.size);
  });

  it('ADMIN_VALID_TRANSITIONS preserves the original web admin route map', () => {
    expect(ADMIN_VALID_TRANSITIONS.pending).toEqual(['paid', 'cancelled']);
    expect(ADMIN_VALID_TRANSITIONS.paid).toEqual(['preparing', 'cancelled']);
    expect(ADMIN_VALID_TRANSITIONS.accepted).toEqual(['cancelled']);
    expect(ADMIN_VALID_TRANSITIONS.preparing).toEqual(['ready', 'cancelled']);
    expect(ADMIN_VALID_TRANSITIONS.ready).toEqual(['cancelled']);
    expect(ADMIN_VALID_TRANSITIONS.picked_up).toBeUndefined();
    expect(ADMIN_VALID_TRANSITIONS.delivered).toBeUndefined();
  });

  it('NOTIFY_STATUSES suppresses pending/paid/accepted', () => {
    expect(NOTIFY_STATUSES.has('pending' as OrderStatus)).toBe(false);
    expect(NOTIFY_STATUSES.has('paid' as OrderStatus)).toBe(false);
    expect(NOTIFY_STATUSES.has('accepted' as OrderStatus)).toBe(false);
    expect(NOTIFY_STATUSES.has('preparing')).toBe(true);
    expect(NOTIFY_STATUSES.has('cancelled')).toBe(true);
  });

  it('ADMIN_TAB_STATUSES partitions every non-pending/paid/accepted status correctly', () => {
    const all = new Set([
      ...ADMIN_TAB_STATUSES.preparing,
      ...ADMIN_TAB_STATUSES.ready,
      ...ADMIN_TAB_STATUSES.history,
    ]);
    for (const s of ORDER_STATUSES) {
      expect(all.has(s)).toBe(true);
    }
  });

  it('TAILWIND_CLASSES_BY_ROLE has six roles with non-empty classes', () => {
    for (const role of ['primary', 'success', 'info', 'warning', 'danger', 'neutral'] as const) {
      expect(TAILWIND_CLASSES_BY_ROLE[role]).toMatch(/^bg-\w+-\d+ text-\w+-\d+$/);
    }
  });

  it('DISPATCH_STATUS_MESSAGES covers manual_review and failed', () => {
    expect(DISPATCH_STATUS_MESSAGES.manual_review).toBeDefined();
    expect(DISPATCH_STATUS_MESSAGES.failed).toBeDefined();
    expect(DISPATCH_STATUS_MESSAGES.manual_review.severity).toBe('danger');
  });
});

describe('parseOrderStatus', () => {
  it('round-trips known wire values', () => {
    for (const s of ORDER_STATUSES) {
      expect(parseOrderStatus(s)).toBe(s);
    }
  });

  it('returns "unknown" for drift values', () => {
    expect(parseOrderStatus('mystery_status')).toBe('unknown');
    expect(parseOrderStatus('out_for_delivery')).toBe('unknown');
    expect(parseOrderStatus(undefined)).toBe('unknown');
    expect(parseOrderStatus(null)).toBe('unknown');
    expect(parseOrderStatus(42)).toBe('unknown');
  });
});

describe('customerLabel', () => {
  it('uses "On the way" for picked_up + delivery', () => {
    expect(customerLabel('picked_up', 'delivery')).toBe('On the way');
  });

  it('uses "Picked Up" for picked_up + self_pickup', () => {
    expect(customerLabel('picked_up', 'self_pickup')).toBe('Picked Up');
  });

  it('uses "Pending Payment" for pending', () => {
    expect(customerLabel('pending', 'delivery')).toBe('Pending Payment');
  });

  it('falls back to Unknown for unknown', () => {
    expect(customerLabel('unknown', 'delivery')).toBe('Unknown');
  });
});

describe('adminLabel + colorRoleFor + tailwindClassesFor', () => {
  it('adminLabel uses "Pending"', () => {
    expect(adminLabel('pending')).toBe('Pending');
  });

  it('adminLabel falls back to "Unknown"', () => {
    expect(adminLabel('unknown')).toBe('Unknown');
  });

  it('colorRoleFor("unknown") is neutral', () => {
    expect(colorRoleFor('unknown')).toBe('neutral');
  });

  it('tailwindClassesFor returns a Tailwind utility string', () => {
    expect(tailwindClassesFor('preparing')).toMatch(/orange/);
    expect(tailwindClassesFor('cancelled')).toMatch(/red/);
    expect(tailwindClassesFor('unknown')).toMatch(/gray/);
  });
});

describe('isTerminal / isCancellable / isCompleted', () => {
  it('isTerminal', () => {
    expect(isTerminal('delivered')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('preparing')).toBe(false);
    expect(isTerminal('unknown')).toBe(false);
  });

  it('isCancellable', () => {
    expect(isCancellable('preparing')).toBe(true);
    expect(isCancellable('delivered')).toBe(false);
    expect(isCancellable('unknown')).toBe(false);
  });

  it('isCompleted = picked_up || delivered', () => {
    expect(isCompleted('picked_up')).toBe(true);
    expect(isCompleted('delivered')).toBe(true);
    expect(isCompleted('cancelled')).toBe(false);
    expect(isCompleted('preparing')).toBe(false);
  });
});
