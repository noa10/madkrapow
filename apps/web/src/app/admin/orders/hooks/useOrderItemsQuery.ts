"use client"

import { useEffect, useState } from "react"
import { getBrowserClient } from "@/lib/supabase/client"

/**
 * A single line item rendered in the admin order-items preview.
 *
 * Column names mirror the `order_items` table (verified against
 * `packages/shared-types/typescript/db.ts` and the live detail-page query in
 * `app/admin/orders/[id]/page.tsx`). `unitPriceCents` maps to the per-unit
 * `menu_item_price_cents` column.
 */
export interface OrderItemPreview {
  id: string
  name: string
  quantity: number
  unitPriceCents: number | null
  imageUrl: string | null
}

interface OrderItemPreviewResult {
  items: OrderItemPreview[]
  isLoading: boolean
  error: string | null
}

/** Raw `order_items` row shape as returned by the embedded select. */
interface RawOrderItem {
  id: string
  menu_item_name: string
  quantity: number
  menu_item_price_cents: number | null
  image_url: string | null
}

interface OrdersWithItemsRow {
  order_items: RawOrderItem[] | null
}

// Only the columns the preview renders. The parent `id` is selected so the
// embedded resource resolves to a stable shape; the list query itself is
// untouched (lazy per-order fetch, plan §7).
const ITEM_SELECT = "id, order_items(id, menu_item_name, quantity, menu_item_price_cents, image_url)"

function toPreview(row: RawOrderItem): OrderItemPreview {
  return {
    id: row.id,
    name: row.menu_item_name,
    quantity: row.quantity,
    unitPriceCents:
      typeof row.menu_item_price_cents === "number" ? row.menu_item_price_cents : null,
    imageUrl: row.image_url ?? null,
  }
}

/**
 * Lazily fetch one order's line items. Pass `null` to stay idle and clear state
 * — the preview modal only supplies an id while it is open, so the list page
 * never pays for this query.
 */
export function useOrderItemsQuery(orderId: string | null): OrderItemPreviewResult {
  const [items, setItems] = useState<OrderItemPreview[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = getBrowserClient()

    const fetchItems = async () => {
      if (!orderId) {
        setItems([])
        setIsLoading(false)
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const { data, error: queryError } = await supabase
          .from("orders")
          .select(ITEM_SELECT)
          .eq("id", orderId)
          .single()

        if (cancelled) return

        if (queryError) {
          setItems([])
          setError(queryError.message)
          return
        }

        const rows = (data as OrdersWithItemsRow | null)?.order_items ?? []
        setItems(rows.map(toPreview))
      } catch (err) {
        if (cancelled) return
        setItems([])
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchItems()

    return () => {
      cancelled = true
    }
  }, [orderId])

  return { items, isLoading, error }
}
