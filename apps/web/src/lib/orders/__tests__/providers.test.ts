import { describe, expect, it } from "vitest"
import { getDeliveryBadge, getPaymentBadge } from "@/lib/orders/providers"

describe("getPaymentBadge", () => {
  it("returns Stripe when stripe_payment_intent_id is set", () => {
    expect(
      getPaymentBadge({ status: "paid", stripe_payment_intent_id: "pi_123" }),
    ).toEqual({ provider: "stripe", label: "Stripe" })
  })

  it("returns Stripe when only stripe_session_id is set", () => {
    expect(
      getPaymentBadge({ status: "paid", stripe_session_id: "cs_123" }),
    ).toEqual({ provider: "stripe", label: "Stripe" })
  })

  it("returns Awaiting Payment when status is pending and no Stripe IDs", () => {
    expect(getPaymentBadge({ status: "pending" })).toEqual({
      provider: "pending",
      label: "Awaiting Payment",
    })
  })

  it("falls back to Cash for confirmed orders without Stripe IDs", () => {
    expect(getPaymentBadge({ status: "paid" })).toEqual({
      provider: "cash",
      label: "Cash",
    })
  })
})

describe("getDeliveryBadge", () => {
  it("returns Self Pickup when delivery_type is self_pickup", () => {
    expect(getDeliveryBadge({ delivery_type: "self_pickup" })).toEqual({
      provider: "self_pickup",
      label: "Self Pickup",
    })
  })

  it("returns Lalamove when lalamove_order_id is set", () => {
    expect(
      getDeliveryBadge({
        delivery_type: "delivery",
        lalamove_order_id: "lm_123",
      }),
    ).toEqual({ provider: "lalamove", label: "Lalamove" })
  })

  it("returns Lalamove when only lalamove_quote_id is set", () => {
    expect(
      getDeliveryBadge({
        delivery_type: "delivery",
        lalamove_quote_id: "q_123",
      }),
    ).toEqual({ provider: "lalamove", label: "Lalamove" })
  })

  it("returns In-house when an explicit driver name is present", () => {
    expect(
      getDeliveryBadge({
        delivery_type: "delivery",
        driver_name: "Ali",
      }),
    ).toEqual({ provider: "in_house", label: "In-house" })
  })

  it("returns Pending Dispatch when nothing is set", () => {
    expect(getDeliveryBadge({ delivery_type: "delivery" })).toEqual({
      provider: "pending",
      label: "Pending Dispatch",
    })
  })

  it("prefers self_pickup over Lalamove when both are present", () => {
    expect(
      getDeliveryBadge({
        delivery_type: "self_pickup",
        lalamove_order_id: "lm_123",
      }),
    ).toEqual({ provider: "self_pickup", label: "Self Pickup" })
  })
})
