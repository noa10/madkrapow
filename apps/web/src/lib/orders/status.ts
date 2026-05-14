/**
 * Canonical order-status types and helpers for the web app.
 *
 * Source of truth: `packages/madkrapow_orders/order_status.json`.
 * Values exported here MUST match that JSON. CI enforces it via
 * `scripts/check-order-status-parity.mjs`.
 */

import spec from '../../../../../packages/madkrapow_orders/order_status.json';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export type DeliveryType = 'delivery' | 'self_pickup';

export type ColorRole =
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'neutral';

/** Canonical wire-string list, ordered to match the SQL CHECK constraint. */
export const ORDER_STATUSES = [
  'pending',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
] as const;

const SPEC_STATUSES = (spec as { statuses: readonly string[] }).statuses;

/** Customer-facing labels keyed by status. `picked_up` has two variants in
 *  the JSON; use `customerLabel(...)` to pick the right one based on
 *  `delivery_type`. */
export const STATUS_LABELS = {
  pending: 'Pending Payment',
  paid: 'Paid',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
} as const satisfies Record<OrderStatus, string>;

export const ADMIN_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
} as const satisfies Record<OrderStatus, string>;

export const STEP_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
} as const;

export const STATUS_COLORS = {
  pending: 'warning',
  paid: 'info',
  accepted: 'info',
  preparing: 'primary',
  ready: 'success',
  picked_up: 'success',
  delivered: 'success',
  cancelled: 'danger',
} as const satisfies Record<OrderStatus, ColorRole>;

/** Tailwind class roles. Maps a [ColorRole] to the project's badge classes. */
export const TAILWIND_CLASSES_BY_ROLE: Record<ColorRole, string> = {
  primary: 'bg-orange-100 text-orange-800',
  success: 'bg-green-100 text-green-800',
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-800',
};

/** Steps shown in the stepper (no `accepted`). */
export const STATUS_FLOW_STEPS = [
  'pending',
  'paid',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
] as const satisfies readonly OrderStatus[];

/** Statuses where the order is finished. */
export const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'delivered',
  'cancelled',
]);

/** Statuses from which an admin can move to `cancelled`. */
export const CANCELLABLE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'pending',
  'paid',
  'accepted',
  'preparing',
  'ready',
]);

/** Forward-transition map (server-enforced). Mirrors the admin status route. */
export const VALID_FORWARD_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  pending: ['paid', 'cancelled'],
  paid: ['preparing', 'cancelled'],
  accepted: ['cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['picked_up', 'cancelled'],
  picked_up: ['delivered'],
  delivered: [],
  cancelled: [],
};

/**
 * Subset of `VALID_FORWARD_TRANSITIONS` exposed to the admin status route.
 * `picked_up`/`delivered` come from Lalamove webhooks and are intentionally
 * NOT in this map.
 */
export const ADMIN_VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ['paid', 'cancelled'],
  paid: ['preparing', 'cancelled'],
  accepted: ['cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['cancelled'],
};

/** Customer notification allowlist (Telegram/WhatsApp). */
export const NOTIFY_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
]);

/** Tab → list of statuses that belong in that tab on the admin orders page. */
export const ADMIN_TAB_STATUSES: Record<
  'preparing' | 'ready' | 'history',
  readonly OrderStatus[]
> = {
  preparing: ['pending', 'paid', 'accepted', 'preparing'],
  ready: ['ready'],
  history: ['picked_up', 'delivered', 'cancelled'],
};

/** Banner copy keyed by `lalamove_shipments.dispatch_status`. */
export interface DispatchBannerCopy {
  title: string;
  body: string;
  customerBody: string;
  severity: 'info' | 'warning' | 'danger';
}

export const DISPATCH_STATUS_MESSAGES: Readonly<Record<string, DispatchBannerCopy>> =
  (spec as { dispatchMessages: Record<string, DispatchBannerCopy> })
    .dispatchMessages;

/** Parse a wire string into an [OrderStatus], or return 'unknown' for drift. */
export function parseOrderStatus(raw: unknown): OrderStatus | 'unknown' {
  return (ORDER_STATUSES as readonly string[]).includes(raw as string)
    ? (raw as OrderStatus)
    : 'unknown';
}

/** Customer-facing label that varies for `picked_up` based on delivery type. */
export function customerLabel(
  status: OrderStatus | 'unknown',
  deliveryType: DeliveryType
): string {
  if (status === 'unknown') return 'Unknown';
  if (status === 'picked_up') {
    return deliveryType === 'delivery' ? 'On the way' : 'Picked Up';
  }
  return STATUS_LABELS[status];
}

export function adminLabel(status: OrderStatus | 'unknown'): string {
  if (status === 'unknown') return 'Unknown';
  return ADMIN_STATUS_LABELS[status];
}

export function colorRoleFor(status: OrderStatus | 'unknown'): ColorRole {
  if (status === 'unknown') return 'neutral';
  return STATUS_COLORS[status];
}

export function tailwindClassesFor(status: OrderStatus | 'unknown'): string {
  return TAILWIND_CLASSES_BY_ROLE[colorRoleFor(status)];
}

export function isTerminal(status: OrderStatus | 'unknown'): boolean {
  return status !== 'unknown' && TERMINAL_STATUSES.has(status);
}

export function isCancellable(status: OrderStatus | 'unknown'): boolean {
  return status !== 'unknown' && CANCELLABLE_STATUSES.has(status);
}

export function isCompleted(status: OrderStatus | 'unknown'): boolean {
  return status === 'picked_up' || status === 'delivered';
}

/** Spec-bound canonical list (kept in sync at runtime so drift in the JSON is
 *  caught by `lint:parity` rather than silently). Useful for tests. */
export const SPEC_CANONICAL_STATUSES: readonly string[] = SPEC_STATUSES;
