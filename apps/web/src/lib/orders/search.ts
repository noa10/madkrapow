/**
 * Pure client-side search predicate for the admin orders toolbar.
 *
 * A `needle` matches an order, case-insensitively, when it appears in:
 *  - the display code (stored `display_code`, or the legacy hash derived from
 *    `id` when the code is absent),
 *  - the customer name,
 *  - the customer phone, including a digits-only query compared against the
 *    normalised phone so "012 345" matches "012-345".
 *
 * A blank/whitespace-only query matches every order. Missing or null fields
 * are ignored and never throw.
 */

import { getOrderDisplayCode } from "@/lib/utils/order-code"
import type { Order } from "@/types/orders"

/** The minimal order shape the search needs; `id` enables the code fallback. */
export type SearchableOrder = Pick<
  Order,
  "display_code" | "customer_name" | "customer_phone"
> & { id?: string }

/** Strip everything but digits so differently punctuation'd phones compare equal. */
function normalisePhone(value: string): string {
  return value.replace(/\D/g, "")
}

function contains(field: string | null | undefined, needle: string): boolean {
  if (!field) return false
  return field.toLowerCase().includes(needle)
}

export function matchesOrderQuery(order: SearchableOrder, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === "") return true

  let code: string | null = order.display_code ?? null
  if (!code && order.id) {
    code = getOrderDisplayCode({ id: order.id })
  }
  if (contains(code, needle)) return true

  if (contains(order.customer_name, needle)) return true

  const phone = order.customer_phone
  if (phone) {
    if (phone.toLowerCase().includes(needle)) return true

    // Digits-only query (spaces/dashes/`+` ignored): compare the digits against
    // the normalised phone so "012 345" matches "+60 12-345".
    const digitsOnly = needle.replace(/[\s\-+]/g, "")
    if (/^\d+$/.test(digitsOnly) && normalisePhone(phone).includes(digitsOnly)) {
      return true
    }
  }

  return false
}
