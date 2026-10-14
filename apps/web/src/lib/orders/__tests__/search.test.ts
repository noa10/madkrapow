import { describe, expect, it } from "vitest"
import { matchesOrderQuery, type SearchableOrder } from "@/lib/orders/search"
import { getOrderDisplayCode } from "@/lib/utils/order-code"

function order(overrides: Partial<SearchableOrder> = {}): SearchableOrder {
  return {
    id: "order-1",
    display_code: "MK-001",
    customer_name: "Aisha Rahman",
    customer_phone: "+60 12-345 6789",
    ...overrides,
  }
}

describe("matchesOrderQuery", () => {
  it("matches on the display code, case-insensitively", () => {
    expect(matchesOrderQuery(order(), "MK-001")).toBe(true)
    expect(matchesOrderQuery(order(), "mk-001")).toBe(true)
    expect(matchesOrderQuery(order(), "MK-0")).toBe(true)
  })

  it("falls back to the derived code when display_code is absent", () => {
    const id = "abcdef123456"
    const derived = getOrderDisplayCode({ id })
    const subject: SearchableOrder = {
      id,
      display_code: null,
      customer_name: null,
      customer_phone: null,
    }
    expect(matchesOrderQuery(subject, derived)).toBe(true)
    expect(matchesOrderQuery(subject, derived.toLowerCase())).toBe(true)
  })

  it("matches on the customer name, case-insensitively and by substring", () => {
    expect(matchesOrderQuery(order(), "aisha")).toBe(true)
    expect(matchesOrderQuery(order(), "RAHMAN")).toBe(true)
    expect(matchesOrderQuery(order(), "isha rah")).toBe(true)
  })

  it("matches on the phone in its stored form", () => {
    expect(matchesOrderQuery(order(), "345 6789")).toBe(true)
    expect(matchesOrderQuery(order(), "+60")).toBe(true)
  })

  it("matches a spaced/dashed phone query", () => {
    const subject = order({ customer_phone: "012-3456789" })
    expect(matchesOrderQuery(subject, "012 345")).toBe(true)
    expect(matchesOrderQuery(subject, "012345")).toBe(true)
  })

  it("matches a digits-only query against the normalised phone", () => {
    expect(matchesOrderQuery(order({ customer_phone: "+60 12-345 6789" }), "0123456789")).toBe(true)
    expect(matchesOrderQuery(order({ customer_phone: "(60) 12 345 6789" }), "6012345")).toBe(true)
  })

  it("trims surrounding whitespace before matching", () => {
    expect(matchesOrderQuery(order(), "  mk-001  ")).toBe(true)
  })

  it("matches everything for an empty or whitespace-only query", () => {
    expect(matchesOrderQuery(order(), "")).toBe(true)
    expect(matchesOrderQuery(order(), "   ")).toBe(true)
    expect(
      matchesOrderQuery(
        { display_code: null, customer_name: null, customer_phone: null },
        "",
      ),
    ).toBe(true)
  })

  it("returns false for a non-matching query", () => {
    expect(matchesOrderQuery(order(), "zzz")).toBe(false)
    expect(matchesOrderQuery(order(), "999")).toBe(false)
  })

  it("never throws on null fields and does not match them", () => {
    const blank: SearchableOrder = {
      display_code: null,
      customer_name: null,
      customer_phone: null,
    }
    expect(matchesOrderQuery(blank, "MK-001")).toBe(false)
    expect(matchesOrderQuery(blank, "123")).toBe(false)
    expect(matchesOrderQuery(blank, "aisha")).toBe(false)
  })

  it("does not throw when the row has neither an id nor a display_code", () => {
    const noCode: SearchableOrder = {
      customer_name: "Bee",
      customer_phone: null,
    }
    expect(matchesOrderQuery(noCode, "bee")).toBe(true)
    expect(matchesOrderQuery(noCode, "MK-001")).toBe(false)
  })
})
