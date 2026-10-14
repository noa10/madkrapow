import { describe, expect, it } from "vitest"
import { getOrderUrgency, getOrderUrgencyNow } from "@/lib/orders/urgency"

const NOW = new Date("2026-10-14T15:30:00")

/** ISO string for `minutes` before NOW (fractional minutes allowed). */
function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60000).toISOString()
}

describe("getOrderUrgency", () => {
  it("labels elapsed time as <1m, m, h, d", () => {
    expect(getOrderUrgency(minutesAgo(0.5), NOW).elapsedLabel).toBe("<1m")
    expect(getOrderUrgency(minutesAgo(5), NOW).elapsedLabel).toBe("5m")
    expect(getOrderUrgency(minutesAgo(120), NOW).elapsedLabel).toBe("2h")
    expect(getOrderUrgency(minutesAgo(3 * 1440), NOW).elapsedLabel).toBe("3d")
  })

  it("clamps future timestamps to 0 minutes (fresh)", () => {
    const future = new Date(NOW.getTime() + 60000).toISOString()
    const result = getOrderUrgency(future, NOW)
    expect(result.minutes).toBe(0)
    expect(result.elapsedLabel).toBe("<1m")
    expect(result.tier).toBe("fresh")
  })

  it("assigns urgency tiers at the exact boundaries", () => {
    expect(getOrderUrgency(minutesAgo(4.99), NOW).tier).toBe("fresh")
    expect(getOrderUrgency(minutesAgo(5), NOW).tier).toBe("warning")
    expect(getOrderUrgency(minutesAgo(15), NOW).tier).toBe("warning")
    expect(getOrderUrgency(minutesAgo(15.01), NOW).tier).toBe("warning")
    expect(getOrderUrgency(minutesAgo(16), NOW).tier).toBe("late")
  })

  it("floors whole minutes for the tier (15.9m is still warning)", () => {
    const result = getOrderUrgency(minutesAgo(15.9), NOW)
    expect(result.minutes).toBe(15)
    expect(result.tier).toBe("warning")
  })

  it("uses a clock label for today and a full label for other days", () => {
    const today = getOrderUrgency(minutesAgo(30), NOW)
    expect(today.isToday).toBe(true)
    expect(today.timestampLabel).toMatch(/^\d{1,2}:\d{2} [AP]M$/)

    const older = getOrderUrgency(minutesAgo(3 * 1440), NOW)
    expect(older.isToday).toBe(false)
    expect(older.timestampLabel).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M$/
    )
  })

  it("is robust to an invalid ISO string", () => {
    const result = getOrderUrgency("not-a-date", NOW)
    expect(result.valid).toBe(false)
    expect(result.elapsedLabel).toBe("")
    expect(result.timestampLabel).toBe("")
    expect(result.isToday).toBe(false)
    expect(result.minutes).toBe(0)
  })
})

describe("getOrderUrgencyNow", () => {
  it("derives a valid result from the current clock", () => {
    const result = getOrderUrgencyNow(new Date().toISOString())
    expect(result.valid).toBe(true)
    expect(result.tier).toBe("fresh")
  })
})
