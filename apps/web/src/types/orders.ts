export type OrderTab = "preparing" | "ready" | "upcoming" | "history"

export type OrderSource =
  | "web"
  | "telegram"
  | "whatsapp"
  | "mobile"
  | "counter"
  | "grabfood"
  | "foodpanda"
  | "shopeefood"

export interface Order {
  id: string
  display_code?: string | null
  channel_orders?: { channel: string; external_order_number: string | null }[] | null
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: string | Record<string, unknown> | null
  customer_phone: string | null
  customer_name: string | null
  delivery_type: string
  fulfillment_type: string
  dispatch_status: string | null
  scheduled_for: string | null
  order_kind: string
  approval_status: string
  bulk_company_name: string | null
  item_count?: number
  source: OrderSource
  customer_id: string | null
  /** Dine-in table reference (delivery_type = 'dine_in'). */
  table_id?: string | null
  /** Table label snapshot captured when the order was placed. */
  table_label?: string | null
  /** Party size for dine-in orders. */
  pax?: number | null
  /** Payment-method snapshot written by the POS/settle paths (payments is the ledger). */
  payment_method?: string | null
  /**
   * Kitchen queue state for counter self-pickup orders that complete at
   * payment. NULL for every other order; `status` is already `delivered`.
   */
  kitchen_status?: "paid" | "preparing" | "ready" | null
  stripe_payment_intent_id: string | null
  stripe_session_id: string | null
  billplz_bill_id: string | null
  lalamove_order_id: string | null
  lalamove_quote_id: string | null
  driver_name: string | null
  driver_phone: string | null
}

export interface DateRange {
  start: string
  end: string
}
