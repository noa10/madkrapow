export type OrderTab = "preparing" | "ready" | "upcoming" | "history"

export interface Order {
  id: string
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
}

export interface DateRange {
  start: string
  end: string
}
