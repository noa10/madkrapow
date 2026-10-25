import { describe, expect, it } from "vitest"
import { getPaymentPill } from "@/lib/orders/payment-pill"
import type { PaymentPillOrder } from "@/lib/orders/payment-pill"

function order(overrides: Partial<PaymentPillOrder>): PaymentPillOrder {
  return {
    status: "paid",
    source: "web",
    stripe_payment_intent_id: null,
    stripe_session_id: null,
    billplz_bill_id: null,
    ...overrides,
  }
}

describe("getPaymentPill", () => {
  it("marks a pending order unpaid with no method", () => {
    expect(getPaymentPill(order({ status: "pending" }))).toEqual({
      state: "unpaid",
      label: "Unpaid",
      method: null,
    })
  })

  it("stays unpaid for a pending platform order", () => {
    expect(getPaymentPill(order({ status: "pending", source: "grabfood" }))).toEqual(
      {
        state: "unpaid",
        label: "Unpaid",
        method: null,
      }
    )
  })

  it("derives Stripe from a payment intent for a paid order", () => {
    expect(
      getPaymentPill(order({ stripe_payment_intent_id: "pi_123" }))
    ).toEqual({ state: "paid", label: "Paid", method: "Stripe" })
  })

  it("derives Stripe when only the session id is set", () => {
    expect(getPaymentPill(order({ stripe_session_id: "cs_123" })).method).toBe(
      "Stripe"
    )
  })

  it("derives Billplz from the bill id for a paid order", () => {
    expect(getPaymentPill(order({ billplz_bill_id: "bill_123" }))).toEqual({
      state: "paid",
      label: "Paid",
      method: "Billplz",
    })
  })

  it("does not claim a method for a counter order with no payment evidence", () => {
    // `orders` has no persisted payment-method column, so a paid counter order
    // cannot be distinguished from a QR-paid one here. Claiming "Cash" would
    // mislabel QR payments.
    const pill = getPaymentPill(order({ source: "counter" }))
    expect(pill).toEqual({ state: "paid", label: "Paid", method: null })
  })

  it("honours an explicitly supplied cash method", () => {
    expect(
      getPaymentPill(order({ source: "counter", payment_method: "cash" })).method
    ).toBe("Cash")
  })

  it("derives QR Pay when payment_method is qr_pay", () => {
    expect(
      getPaymentPill(order({ source: "counter", payment_method: "qr_pay" }))
        .method
    ).toBe("QR Pay")
  })

  it("derives platform methods for GrabFood and Foodpanda", () => {
    expect(getPaymentPill(order({ source: "grabfood" })).method).toBe("GrabFood")
    expect(getPaymentPill(order({ source: "foodpanda" })).method).toBe(
      "Foodpanda"
    )
  })

  it("keeps state paid with a method label for every non-pending case", () => {
    const cases: Array<[Partial<PaymentPillOrder>, string]> = [
      [{ stripe_payment_intent_id: "pi_1" }, "Stripe"],
      [{ billplz_bill_id: "bill_1" }, "Billplz"],
      [{ source: "counter", payment_method: "cash" }, "Cash"],
      [{ source: "counter", payment_method: "qr_pay" }, "QR Pay"],
      [{ source: "grabfood" }, "GrabFood"],
      [{ source: "foodpanda" }, "Foodpanda"],
    ]
    for (const [overrides, method] of cases) {
      const pill = getPaymentPill(order(overrides))
      expect(pill.state).toBe("paid")
      expect(pill.label).toBe("Paid")
      expect(pill.method).toBe(method)
    }
  })
})
