export type OrderTab = "preparing" | "ready" | "upcoming" | "history"

export type OrderSource = "web" | "telegram" | "whatsapp" | "mobile"

export interface Order {
  id: string
  display_code?: string | null
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
  stripe_payment_intent_id: string | null
  stripe_session_id: string | null
  lalamove_order_id: string | null
  lalamove_quote_id: string | null
  driver_name: string | null
  driver_phone: string | null
}

export interface DateRange {
  start: string
  end: string
}
