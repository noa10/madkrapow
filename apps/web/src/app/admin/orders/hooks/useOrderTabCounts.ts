"use client"

/**
 * Per-tab order counts for the admin orders pill tabs.
 *
 * Each countable tab issues a `HEAD`-style `count: "exact"` query using the
 * exact filters `ADMIN_TAB_FILTERS` (the same source `useOrderTabQuery`
 * consumes, so the counters cannot drift from the list). History is
 * date-ranged/unbounded and returns `null` — no counter.
 *
 * Counts refresh when a tab cache is invalidated (realtime events call
 * `invalidateTab`/`invalidateAllTabs`) or the source filter changes. Refetches
 * are debounced 500ms so a busy kitchen feed cannot storm the API.
 */

import { useEffect, useRef, useState } from "react"
import { getBrowserClient } from "@/lib/supabase/client"
import { useAdminOrdersStore, type SourceFilterValue } from "@/stores/adminOrdersStore"
import {
  ADMIN_TAB_FILTERS,
  upcomingOrFilter,
  upcomingExcludedStatusFilter,
  type BulkOrScheduledTabFilter,
} from "@/lib/orders/tab-filters"
import type { OrderTab } from "@/types/orders"

type BrowserClient = ReturnType<typeof getBrowserClient>

/** `status = 'pending'` ASAP orders — the "Unpaid" metric. */
const UNPAID_STATUSES = ["pending"] as const

/** Structural view of a `count`/`head` response so the helper stays generic. */
type CountResponse = { count: number | null; error: unknown }

const EMPTY_COUNTS: Record<OrderTab, number | null> = {
  preparing: null,
  ready: null,
  upcoming: null,
  history: null,
}

export interface OrderTabCountsResult {
  /** Exact row counts per tab; `null` = not loaded, or query failed. */
  counts: Record<OrderTab, number | null>
  /** Count of `pending` ASAP orders (the "Unpaid" metric); `null` on failure. */
  unpaidCount: number | null
  isLoading: boolean
}

async function resolveCount(query: PromiseLike<CountResponse>): Promise<number | null> {
  try {
    const { count, error } = await query
    if (error) return null
    return typeof count === "number" ? count : null
  } catch {
    return null
  }
}

function statusCountQuery(
  supabase: BrowserClient,
  statuses: readonly string[],
  fulfillmentType: string,
  sourceFilter: SourceFilterValue,
) {
  let query = supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .in("status", [...statuses])
    .eq("fulfillment_type", fulfillmentType)

  if (sourceFilter !== "all") {
    query = query.eq("source", sourceFilter)
  }
  return query
}

function upcomingCountQuery(
  supabase: BrowserClient,
  filter: BulkOrScheduledTabFilter,
  sourceFilter: SourceFilterValue,
) {
  // A single OR'd query counts the union of (bulk OR scheduled) without
  // double-counting rows that are both. Terminal statuses are excluded to
  // mirror the tab query's post-merge filter.
  let query = supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .or(upcomingOrFilter(filter))
    .not("status", "in", upcomingExcludedStatusFilter(filter))

  if (sourceFilter !== "all") {
    query = query.eq("source", sourceFilter)
  }
  return query
}

async function fetchCounts(
  supabase: BrowserClient,
  sourceFilter: SourceFilterValue,
): Promise<Pick<OrderTabCountsResult, "counts" | "unpaidCount">> {
  const preparing = ADMIN_TAB_FILTERS.preparing
  const ready = ADMIN_TAB_FILTERS.ready
  const upcoming = ADMIN_TAB_FILTERS.upcoming

  const [preparingCount, readyCount, upcomingCount, unpaidCount] = await Promise.all([
    preparing.kind === "statuses"
      ? resolveCount(
          statusCountQuery(supabase, preparing.statuses, preparing.fulfillmentType, sourceFilter),
        )
      : Promise.resolve(null),
    ready.kind === "statuses"
      ? resolveCount(
          statusCountQuery(supabase, ready.statuses, ready.fulfillmentType, sourceFilter),
        )
      : Promise.resolve(null),
    upcoming.kind === "bulk-or-scheduled"
      ? resolveCount(upcomingCountQuery(supabase, upcoming, sourceFilter))
      : Promise.resolve(null),
    resolveCount(statusCountQuery(supabase, UNPAID_STATUSES, "asap", sourceFilter)),
  ])

  return {
    counts: {
      preparing: preparingCount,
      ready: readyCount,
      upcoming: upcomingCount,
      history: null,
    },
    unpaidCount,
  }
}

export function useOrderTabCounts(): OrderTabCountsResult {
  // Stable string across the four caches; changes whenever any tab is invalidated.
  const refetchTriggers = useAdminOrdersStore(
    (s) =>
      `${s.caches.preparing.refetchTrigger}:${s.caches.ready.refetchTrigger}:${s.caches.upcoming.refetchTrigger}:${s.caches.history.refetchTrigger}`,
  )
  const sourceFilter = useAdminOrdersStore((s) => s.sourceFilter)

  const [counts, setCounts] = useState<Record<OrderTab, number | null>>(EMPTY_COUNTS)
  const [unpaidCount, setUnpaidCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const isFirstRun = useRef(true)

  useEffect(() => {
    let cancelled = false
    const delay = isFirstRun.current ? 0 : 500
    isFirstRun.current = false

    const timer = setTimeout(() => {
      setIsLoading(true)
      const supabase = getBrowserClient()
      fetchCounts(supabase, sourceFilter)
        .then((result) => {
          if (cancelled) return
          setCounts(result.counts)
          setUnpaidCount(result.unpaidCount)
        })
        .catch(() => {
          // Non-fatal: leave the previous counts in place.
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [refetchTriggers, sourceFilter])

  return { counts, unpaidCount, isLoading }
}
