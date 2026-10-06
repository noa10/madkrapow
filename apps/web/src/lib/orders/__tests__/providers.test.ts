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

  it("returns GrabFood when source is grabfood", () => {
    expect(getPaymentBadge({ status: "paid", source: "grabfood" })).toEqual({
      provider: "grabfood",
      label: "GrabFood",
    })
  })

  it("returns Foodpanda when source is foodpanda", () => {
    expect(getPaymentBadge({ status: "paid", source: "foodpanda" })).toEqual({
      provider: "foodpanda",
      label: "Foodpanda",
    })
  })

  it("returns QR Pay when payment_method is qr_pay (counter POS)", () => {
    expect(
      getPaymentBadge({ status: "paid", source: "counter", payment_method: "qr_pay" }),
    ).toEqual({ provider: "qr_pay", label: "QR Pay" })
  })

  it("keeps Stripe priority over platform source", () => {
    expect(
      getPaymentBadge({
        status: "paid",
        source: "grabfood",
        stripe_payment_intent_id: "pi_123",
      }),
    ).toEqual({ provider: "stripe", label: "Stripe" })
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

  it("returns platform rider for grabfood delivery orders", () => {
    expect(
      getDeliveryBadge({ delivery_type: "delivery", source: "grabfood" }),
    ).toEqual({ provider: "platform", label: "GrabFood Rider" })
  })

  it("returns platform rider for foodpanda delivery orders", () => {
    expect(
      getDeliveryBadge({ delivery_type: "delivery", source: "foodpanda" }),
    ).toEqual({ provider: "platform", label: "Foodpanda Rider" })
  })

  it("keeps self_pickup priority for platform pickup orders", () => {
    expect(
      getDeliveryBadge({
        delivery_type: "self_pickup",
        source: "grabfood",
      }),
    ).toEqual({ provider: "self_pickup", label: "Self Pickup" })
  })
})
