import { describe, expect, it } from "vitest"

import { mergeRealtimeOrder, type ChannelIdentity } from "../realtime"

const CHANNEL: ChannelIdentity[] = [
  { channel: "grabfood", external_order_number: "GF-659" },
]

describe("mergeRealtimeOrder", () => {
  it("updates order fields and preserves the embedded channel short number", () => {
    const merged = mergeRealtimeOrder(
      { id: "order-1", status: "accepted", display_code: "MK-042", channel_orders: CHANNEL },
      { id: "order-1", status: "preparing", display_code: "MK-042" },
    )

    expect(merged.status).toBe("preparing")
    expect(merged.channel_orders).toEqual(CHANNEL)
  })

  it("keeps an explicit channel value from the incoming row", () => {
    const merged = mergeRealtimeOrder(
      { id: "order-1", channel_orders: CHANNEL as ChannelIdentity[] | null },
      { id: "order-1", channel_orders: null },
    )

    expect(merged.channel_orders).toBeNull()
  })

  it("returns the incoming row when there is no cached row", () => {
    const incoming = { id: "order-1", status: "pending" }

    expect(mergeRealtimeOrder(undefined, incoming)).toEqual(incoming)
  })

  it("does not mutate either input", () => {
    const current = { id: "order-1", status: "accepted", channel_orders: CHANNEL }
    const incoming = { id: "order-1", status: "preparing" }

    mergeRealtimeOrder(current, incoming)

    expect(current.status).toBe("accepted")
    expect(incoming).toEqual({ id: "order-1", status: "preparing" })
  })
})
