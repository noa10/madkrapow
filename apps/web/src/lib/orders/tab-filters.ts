/**
 * Single source of truth for each admin tab's query filters.
 *
 * Both `useOrderTabQuery` (the tab fetch hook) and any future counts hook
 * derive their filters from `ADMIN_TAB_FILTERS`, so the two cannot drift
 * apart. Status lists are derived from `ADMIN_TAB_STATUSES` (./status) rather
 * than re-typed here.
 *
 * The filter shapes are discriminated on `kind` so callers can branch:
 * - `statuses`          → `status IN (...) AND fulfillment_type = ...`
 * - `bulk-or-scheduled` → two OR'd queries (order_kind IN (...) OR
 *                         fulfillment_type = ...), minus terminal statuses
 * - `history`           → `status IN (...)` scoped to a required date window
 */

import { ADMIN_TAB_STATUSES, type OrderStatus } from "@/lib/orders/status"
import type { OrderTab } from "@/types/orders"

/** A single `status IN (...) AND fulfillment_type = ...` query. */
export interface StatusTabFilter {
  kind: "statuses"
  statuses: readonly OrderStatus[]
  fulfillmentType: "asap" | "scheduled"
}

/** A bulk OR scheduled query, excluding terminal statuses after merge. */
export interface BulkOrScheduledTabFilter {
  kind: "bulk-or-scheduled"
  orderKinds: readonly string[]
  fulfillmentType: "scheduled"
  excludeStatuses: readonly OrderStatus[]
}

/** A terminal-status query that is only valid inside a date window. */
export interface HistoryTabFilter {
  kind: "history"
  statuses: readonly OrderStatus[]
  requiresDateRange: true
}

export type AdminTabFilter =
  | StatusTabFilter
  | BulkOrScheduledTabFilter
  | HistoryTabFilter

/**
 * Filters per admin tab. `preparing` intentionally includes `accepted`
 * (via `ADMIN_TAB_STATUSES.preparing`) so it agrees with the canonical status
 * partition in ./status. The upcoming exclusion set is the terminal/history
 * statuses, so `picked_up`/`delivered`/`cancelled` drop out of the merge.
 */
export const ADMIN_TAB_FILTERS: Record<OrderTab, AdminTabFilter> = {
  preparing: {
    kind: "statuses",
    statuses: ADMIN_TAB_STATUSES.preparing,
    fulfillmentType: "asap",
  },
  ready: {
    kind: "statuses",
    statuses: ADMIN_TAB_STATUSES.ready,
    fulfillmentType: "asap",
  },
  upcoming: {
    kind: "bulk-or-scheduled",
    orderKinds: ["bulk"],
    fulfillmentType: "scheduled",
    excludeStatuses: ADMIN_TAB_STATUSES.history,
  },
  history: {
    kind: "history",
    statuses: ADMIN_TAB_STATUSES.history,
    requiresDateRange: true,
  },
}

/**
 * PostgREST `or=` value for the Upcoming count. A single OR'd expression counts
 * the union of (bulk OR scheduled) without double-counting a row that is both —
 * unlike summing two separate counts.
 */
export function upcomingOrFilter(filter: BulkOrScheduledTabFilter): string {
  return `order_kind.in.(${filter.orderKinds.join(',')}),fulfillment_type.eq.${filter.fulfillmentType}`;
}

/**
 * PostgREST `in=` value listing the statuses the Upcoming count must exclude, so
 * the counter agrees with the tab query's post-merge filter.
 */
export function upcomingExcludedStatusFilter(filter: BulkOrScheduledTabFilter): string {
  return `(${filter.excludeStatuses.join(',')})`;
}
