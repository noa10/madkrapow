/**
 * GrabFood Partner API (POS integration) type definitions.
 *
 * Wire format is camelCase (as Grab sends/consumes it). Money is in minor
 * units (MYR exponent 2 — sen). Field coverage follows the Submit Order
 * webhook + List Orders spec; optional fields we don't consume are omitted.
 */

// ---------------------------------------------------------------------------
// Webhooks (Grab -> us)
// ---------------------------------------------------------------------------

export interface GrabOrderItemModifier {
  id?: string
  name?: string
  quantity?: number
  price?: number
}

export interface GrabOrderItem {
  /** Grab's item ID */
  itemID?: string
  /** The partner-side mapping ID — this is our channel_products.external_item_id */
  merchantItemID?: string
  name?: string
  quantity: number
  /** Per-item price including modifiers, minor units, tax-inclusive */
  price: number
  /** Special instructions / notes from the eater */
  specifications?: string
  modifiers?: GrabOrderItemModifier[]
}

export interface GrabOrderPrice {
  subtotal?: number
  tax?: number
  deliveryFee?: number
  /** Platform-funded discounts (do not reduce our revenue) */
  grabFundPromo?: number
  /** Merchant-funded discount (reduces our revenue) */
  merchantFundPromo?: number
  basketPromo?: number
  eaterPayment?: number
  total?: number
}

export interface GrabReceiver {
  name?: string
  phone?: string
}

export interface GrabOrderBase {
  orderID: string
  /** Short human order number, unique per merchant per day (e.g. GF-659 style) */
  shortOrderNumber?: string
  merchantID: string
  partnerMerchantID?: string
  paymentType?: string
  cutlery?: boolean
  orderTime?: string
  scheduledTime?: string
  currency?: string
  items?: GrabOrderItem[]
  price?: GrabOrderPrice
  receiver?: GrabReceiver
}

/** Submit Order webhook payload: a new paid order to be accepted by the POS. */
export interface GrabSubmitOrderPayload extends GrabOrderBase {
  orderID: string
  merchantID: string
}

/** Push Order State webhook payload. */
export interface GrabOrderStatePayload {
  orderID: string
  /** e.g. Accepted, DriverAssigned, DriverArrived, Completed, Cancelled, Failed */
  toState: string
  shortOrderNumber?: string
  partnerMerchantID?: string
}

// ---------------------------------------------------------------------------
// Internal status mapping
// ---------------------------------------------------------------------------

/**
 * GrabFood order states -> our canonical 8-status machine. Never stored on
 * orders.status directly — the mapper returns the target and the route applies
 * it with the atomic conditional-update guard (VALID_FORWARD_TRANSITIONS).
 */
export const GRAB_STATE_TO_INTERNAL: Record<string, 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled'> = {
  Accepted: 'preparing',
  DriverAssigned: 'preparing',
  DriverArrived: 'ready',
  Completed: 'delivered',
  Cancelled: 'cancelled',
  Failed: 'cancelled',
}

// ---------------------------------------------------------------------------
// Outbound request/response types
// ---------------------------------------------------------------------------

export interface GrabMenuRecordUpdate {
  merchantID: string
  field: 'ITEM' | 'MODIFIER'
  id: string
  /** Minor units */
  price?: number
  availableStatus?: 'AVAILABLE' | 'UNAVAILABLE'
  maxStock?: number
}

export interface GrabListOrdersResponse {
  orders?: Array<GrabOrderBase & { orderState?: string }>
}
