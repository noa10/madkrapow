import { describe, expect, it } from "vitest"
import {
  ADMIN_TAB_FILTERS,
  upcomingOrFilter,
  upcomingExcludedStatusFilter,
} from "@/lib/orders/tab-filters"
import { ADMIN_TAB_STATUSES } from "@/lib/orders/status"
import type { OrderTab } from "@/types/orders"

describe("ADMIN_TAB_FILTERS", () => {
  it("derives preparing/ready/history statuses from ADMIN_TAB_STATUSES", () => {
    const preparing = ADMIN_TAB_FILTERS.preparing
    if (preparing.kind !== "statuses") throw new Error("expected statuses filter")
    expect([...preparing.statuses]).toEqual([...ADMIN_TAB_STATUSES.preparing])

    const ready = ADMIN_TAB_FILTERS.ready
    if (ready.kind !== "statuses") throw new Error("expected statuses filter")
    expect([...ready.statuses]).toEqual([...ADMIN_TAB_STATUSES.ready])

    const history = ADMIN_TAB_FILTERS.history
    if (history.kind !== "history") throw new Error("expected history filter")
    expect([...history.statuses]).toEqual([...ADMIN_TAB_STATUSES.history])
  })

  it("includes accepted in the preparing tab so it agrees with status.ts", () => {
    const preparing = ADMIN_TAB_FILTERS.preparing
    if (preparing.kind !== "statuses") throw new Error("expected statuses filter")
    expect([...preparing.statuses]).toEqual([
      "pending",
      "paid",
      "accepted",
      "preparing",
    ])
    expect(preparing.statuses).toContain("accepted")
    expect(preparing.fulfillmentType).toBe("asap")
  })

  it("ready tab is statuses=[ready] with asap fulfillment", () => {
    const ready = ADMIN_TAB_FILTERS.ready
    if (ready.kind !== "statuses") throw new Error("expected statuses filter")
    expect([...ready.statuses]).toEqual(["ready"])
    expect(ready.fulfillmentType).toBe("asap")
  })

  it("upcoming tab is the bulk-or-scheduled discriminated filter", () => {
    const upcoming = ADMIN_TAB_FILTERS.upcoming
    expect(upcoming.kind).toBe("bulk-or-scheduled")
    if (upcoming.kind !== "bulk-or-scheduled")
      throw new Error("expected bulk-or-scheduled filter")
    expect([...upcoming.orderKinds]).toContain("bulk")
    expect(upcoming.fulfillmentType).toBe("scheduled")
    expect([...upcoming.excludeStatuses]).toEqual([
      ...ADMIN_TAB_STATUSES.history,
    ])
  })

  it("uses the DB constraint value 'scheduled', never 'schedule'", () => {
    const upcoming = ADMIN_TAB_FILTERS.upcoming
    if (upcoming.kind !== "bulk-or-scheduled")
      throw new Error("expected bulk-or-scheduled filter")
    expect(upcoming.fulfillmentType).toBe("scheduled")
    // Guards the old drift bug where the query used the wrong literal.
    expect(upcoming.fulfillmentType).not.toBe("schedule")
  })

  it("history tab requires a date range and covers terminal statuses", () => {
    const history = ADMIN_TAB_FILTERS.history
    expect(history.kind).toBe("history")
    if (history.kind !== "history") throw new Error("expected history filter")
    expect(history.requiresDateRange).toBe(true)
    expect([...history.statuses]).toEqual([
      "picked_up",
      "delivered",
      "cancelled",
    ])
  })

  it("covers every OrderTab", () => {
    const tabs: OrderTab[] = ["preparing", "ready", "upcoming", "history"]
    for (const tab of tabs) {
      expect(ADMIN_TAB_FILTERS[tab]).toBeDefined()
    }
  })
})

describe("upcoming count filter strings", () => {
  const upcoming = ADMIN_TAB_FILTERS.upcoming
  if (upcoming.kind !== "bulk-or-scheduled") throw new Error("expected bulk-or-scheduled filter")

  // These strings are hand-built PostgREST syntax, so pin the exact shape: a
  // malformed `.or()` / `.not()` still typechecks and silently returns a wrong
  // count (or errors at runtime) rather than failing the build.
  it("builds the OR'd bulk-or-scheduled expression", () => {
    expect(upcomingOrFilter(upcoming)).toBe(
      "order_kind.in.(bulk),fulfillment_type.eq.scheduled"
    )
  })

  it("builds the excluded-status list", () => {
    expect(upcomingExcludedStatusFilter(upcoming)).toBe("(picked_up,delivered,cancelled)")
  })

  it("derives both strings from the filter, not from literals", () => {
    const widened = { ...upcoming, orderKinds: ["bulk", "catering"] }
    expect(upcomingOrFilter(widened)).toBe(
      "order_kind.in.(bulk,catering),fulfillment_type.eq.scheduled"
    )

    const narrowed = { ...upcoming, excludeStatuses: ["delivered"] as const }
    expect(upcomingExcludedStatusFilter(narrowed)).toBe("(delivered)")
  })

  it("excludes exactly the history statuses, so the count matches the tab query", () => {
    expect(upcomingExcludedStatusFilter(upcoming)).toBe(
      `(${ADMIN_TAB_STATUSES.history.join(",")})`
    )
  })
})
