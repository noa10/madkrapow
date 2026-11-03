import { describe, expect, it } from "vitest"

import { ADMIN_ORDER_DETAIL_SELECT, ADMIN_ORDER_LIST_SELECT, withOrderItemCount, type AdminOrderListRow } from "../order-select"

function row(overrides: Partial<AdminOrderListRow> = {}): AdminOrderListRow {
  return {
    id: "order-1",
    display_code: "MK-001",
    status: "paid",
    total_cents: 4200,
    created_at: "2026-10-18T05:00:00.000Z",
    delivery_type: "delivery",
    fulfillment_type: "asap",
    dispatch_status: null,
    customer_name: "Aisyah",
    customer_phone: "+60123456789",
    order_kind: "regular",
    source: "web",
    stripe_payment_intent_id: null,
    stripe_session_id: null,
    billplz_bill_id: null,
    order_items: null,
    ...overrides,
  } as AdminOrderListRow
}

describe("ADMIN_ORDER_LIST_SELECT", () => {
  it("embeds the channel short number needed by the merchant list", () => {
    expect(ADMIN_ORDER_LIST_SELECT).toContain(
      "channel_orders(channel, external_order_number)"
    )
  })
})

describe("ADMIN_ORDER_DETAIL_SELECT", () => {
  it("embeds the channel short number for the detail header", () => {
    expect(ADMIN_ORDER_DETAIL_SELECT).toContain(
      "channel_orders(channel, external_order_number)"
    )
    expect(ADMIN_ORDER_DETAIL_SELECT).toContain("order_item_modifiers (*)")
  })
})

describe("withOrderItemCount", () => {
  it("preserves the embedded channel identity", () => {
    const mapped = withOrderItemCount(
      row({
        channel_orders: [
          { channel: "grabfood", external_order_number: "GF-659" },
        ],
      })
    )

    expect(mapped.channel_orders).toEqual([
      { channel: "grabfood", external_order_number: "GF-659" },
    ])
  })

  it("sums the embedded order item quantities into item_count", () => {
    const mapped = withOrderItemCount(
      row({ order_items: [{ quantity: 2 }, { quantity: 1 }] })
    )

    expect(mapped.item_count).toBe(3)
    expect(mapped.id).toBe("order-1")
    expect(mapped).not.toHaveProperty("order_items")
  })

  it("uses zero when the embedded items are missing or empty", () => {
    expect(withOrderItemCount(row({ order_items: null })).item_count).toBe(0)
    expect(withOrderItemCount(row({ order_items: [] })).item_count).toBe(0)
  })
})
