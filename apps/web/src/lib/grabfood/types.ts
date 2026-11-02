/**
 * GrabFood Partner API (POS) type definitions — API v1.1.3.
 *
 * Wire format is camelCase as Grab sends/consumes it. Money is in minor units
 * (MYR sen; currency exponent 2). These types are the single source of truth
 * for both inbound webhooks and outbound requests; Grab's official Node SDK
 * models were used to verify field names and enums.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface GrabCurrency {
  code: string
  symbol: string
  exponent: number
}

export type GrabOrderType =
  | 'TakeAway'
  | 'DeliveredByGrab'
  | 'DeliveredByRestaurant'
  | 'DineIn'
  | 'ScanToOrder'
  | 'TakeAwayOrder'
  | 'PosDineOutOrder'

export type GrabPaymentType = 'CASH' | 'CASHLESS'

export interface GrabOrderFeatureFlags {
  orderAcceptedType?: 'AUTO' | 'MANUAL'
  orderType?: GrabOrderType | string
  /** True when Grab edited/recalculated the order; the resend is not a duplicate. */
  isMexEditOrder?: boolean
}

export interface GrabOrderItemModifier {
  id?: string
  price?: number
  tax?: number
  quantity?: number
}

/** Grab's order item. `id` is the partner's item ID (our channel_products.external_item_id). */
export interface GrabOrderItem {
  id: string
  /** Grab's own item identifier; informational only. */
  grabItemID?: string
  quantity: number
  /** Per-unit price including modifiers, minor units, tax-inclusive. */
  price: number
  tax?: number
  specifications?: string
  modifiers?: GrabOrderItemModifier[]
}

export interface GrabMerchantEarning {
  revenue?: number
  netEarning?: number
  mexFundDiscount?: number
  commission?: number
}

export interface GrabOrderPrice {
  subtotal?: number
  tax?: number
  merchantChargeFee?: number
  serviceChargeFee?: number
  /** Grab-funded discount — does not reduce merchant revenue. */
  grabFundPromo?: number
  /** Merchant-funded discount — reduces merchant revenue. */
  merchantFundPromo?: number
  /**
   * Total basket promo. In Grab's own example this equals grabFundPromo +
   * merchantFundPromo, so it must never be subtracted in addition to
   * merchantFundPromo.
   */
  basketPromo?: number
  deliveryFee?: number
  smallOrderFee?: number
  eaterPayment?: number
  total?: number
  merchantEarning?: GrabMerchantEarning
}

export interface GrabReceiverAddress {
  unitNumber?: string
  deliveryInstruction?: string
  address?: string
  postcode?: number | string
  coordinates?: { latitude?: number; longitude?: number }
}

export interface GrabReceiver {
  name?: string
  /** Grab documents `phones`; older samples use `phone`. */
  phones?: string
  phone?: string
  address?: GrabReceiverAddress
  virtualContact?: {
    phoneNumber?: string
    PIN?: number
    expiredAt?: string
    status?: string
  }
}

export interface GrabOrderReadyEstimation {
  allowChange?: boolean
  estimatedOrderReadyTime?: string
  maxOrderReadyTime?: string
  newOrderReadyTime?: string
}

export interface GrabOrderBase {
  orderID: string
  shortOrderNumber?: string
  merchantID: string
  partnerMerchantID?: string
  paymentType?: GrabPaymentType | string
  cutlery?: boolean
  orderTime?: string
  submitTime?: string
  completeTime?: string
  scheduledTime?: string
  orderState?: string
  currency?: GrabCurrency
  featureFlags?: GrabOrderFeatureFlags
  items?: GrabOrderItem[]
  price?: GrabOrderPrice
  receiver?: GrabReceiver
  orderReadyEstimation?: GrabOrderReadyEstimation
}

/** Submit Order webhook payload — a new or edited order from Grab. */
export interface GrabSubmitOrderPayload extends GrabOrderBase {
  orderID: string
  merchantID: string
  items: GrabOrderItem[]
}

/** Push Order State webhook payload (Grab documents `state`, uppercase values). */
export interface GrabOrderStatePayload {
  orderID: string
  /** Current documented field. */
  state?: string
  /** Legacy/alternate field used by older docs and the previous implementation. */
  toState?: string
  merchantID?: string
  partnerMerchantID?: string
  driverETA?: number | null
  code?: string | null
  message?: string | null
  order?: GrabOrderBase
}

// ---------------------------------------------------------------------------
// Internal status mapping
// ---------------------------------------------------------------------------

/**
 * GrabFood order states -> our canonical 8-status machine.
 *
 * Deliberate choices:
 *   - ACCEPTED / DRIVER_ALLOCATED / DRIVER_ARRIVED / BILL_PAID carry no
 *     kitchen transition. Driver arrival is not kitchen completion.
 *   - COLLECTED means the driver has the food -> picked_up.
 *   - DELIVERED / COMPLETED -> delivered.
 *   - CANCELLED / FAILED / REFUNDED -> cancelled where still cancellable.
 */
export const GRAB_STATE_TO_INTERNAL: Record<
  string,
  'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled'
> = {
  ACCEPTED: 'preparing',
  DRIVER_ALLOCATED: 'preparing',
  DRIVER_ARRIVED: 'ready',
  COLLECTED: 'picked_up',
  DELIVERED: 'delivered',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
  FAILED: 'cancelled',
  REFUNDED: 'cancelled',
  // Legacy TitleCase values from the previous implementation.
  Accepted: 'preparing',
  DriverAssigned: 'preparing',
  DriverArrived: 'ready',
  Collected: 'picked_up',
  Completed: 'delivered',
  Cancelled: 'cancelled',
  Failed: 'cancelled',
}

/** States that only change the external status, never the kitchen status. */
export const GRAB_STATES_WITHOUT_KITCHEN_TRANSITION = new Set([
  'ACCEPTED',
  'DRIVER_ALLOCATED',
  'DRIVER_ARRIVED',
  'BILL_PAID',
  // Legacy TitleCase equivalents.
  'Accepted',
  'DriverAssigned',
  'DriverArrived',
])

// ---------------------------------------------------------------------------
// Menu (Get Menu / Push Grab Menu)
// ---------------------------------------------------------------------------

export type GrabAvailableStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNAVAILABLETODAY' | 'HIDE'

export type GrabMenuDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export interface GrabOpenPeriod {
  startTime: string
  endTime: string
}

export interface GrabServiceHour {
  openPeriodType: 'OpenPeriod' | 'OpenAllDay' | 'CloseAllDay'
  periods?: GrabOpenPeriod[]
}

export type GrabServiceHours = Record<GrabMenuDay, GrabServiceHour>

export interface GrabSellingTime {
  id: string
  name: string
  /** UTC, `YYYY-MM-DD HH:mm:ss` per Grab's menu schema. */
  startTime: string
  /** UTC, `YYYY-MM-DD HH:mm:ss` per Grab's menu schema. */
  endTime: string
  serviceHours: GrabServiceHours
}

export interface GrabMenuModifier {
  id: string
  name: string
  availableStatus: GrabAvailableStatus
  price?: number
  sequence?: number
}

export interface GrabModifierGroup {
  id: string
  name: string
  availableStatus: GrabAvailableStatus
  selectionRangeMin?: number
  selectionRangeMax: number
  sequence?: number
  modifiers?: GrabMenuModifier[]
}

export interface GrabMenuItem {
  id: string
  name: string
  availableStatus: GrabAvailableStatus
  description?: string
  price: number
  photos?: string[]
  taxable?: boolean
  sellingTimeID?: string
  maxStock?: number
  sequence?: number
  modifierGroups?: GrabModifierGroup[]
}

export interface GrabMenuCategory {
  id: string
  name: string
  availableStatus: GrabAvailableStatus
  sellingTimeID: string
  sequence?: number
  items: GrabMenuItem[]
}

/** Payload returned by Get Menu and pushed by Push Grab Menu. */
export interface GrabMenuPayload {
  merchantID?: string
  partnerMerchantID?: string
  currency: GrabCurrency
  sellingTimes: GrabSellingTime[]
  categories: GrabMenuCategory[]
}

/** GET /partner/v1/menu query parameters. */
export interface GrabGetMenuQuery {
  merchantID?: string
  partnerMerchantID?: string
}

/** Menu Sync State webhook. */
export interface GrabMenuSyncStatePayload {
  requestID?: string
  merchantID?: string
  partnerMerchantID?: string
  jobID?: string
  updatedAt?: string
  status?: 'QUEUEING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | string
  errors?: string[]
}

/** Push Store Integration Status webhook. */
export interface GrabIntegrationStatusPayload {
  partnerMerchantID: string
  grabMerchantID: string
  integrationStatus: 'INACTIVE' | 'ACTIVE' | 'SYNCING' | 'FAILED'
}

// ---------------------------------------------------------------------------
// Outbound request/response types
// ---------------------------------------------------------------------------

/**
 * One menu record update (PUT /partner/v1/menu — flat shape).
 *
 * Grab requires `name` alongside `id`. Setting UNAVAILABLE requires
 * maxStock = 0 on the same record; maxStock > 0 flips the item back to
 * AVAILABLE.
 */
export interface GrabMenuRecordUpdate {
  merchantID: string
  field: 'ITEM' | 'MODIFIER'
  id: string
  name: string
  /** Minor units */
  price?: number
  isFree?: boolean
  availableStatus?: GrabAvailableStatus
  maxStock?: number
}

export interface GrabBatchMenuRecordUpdate {
  merchantID: string
  field: 'ITEM' | 'MODIFIER'
  menuEntities: Array<{
    id: string
    price?: number
    availableStatus?: GrabAvailableStatus
    maxStock?: number
  }>
}

export interface GrabListOrdersResponse {
  more?: boolean
  orders?: Array<GrabOrderBase & { orderState?: string }>
}

export interface GrabListOrdersQuery {
  merchantID: string
  date?: string
  page?: number
  orderIDs?: string[]
}

/** GET /partner/v1/merchant/menu/trace — last menu sync attempt on Grab's side. */
export interface GrabMenuSyncTrace {
  merchantID?: string
  lastSyncTime?: string
  status?: string
  message?: string
  [key: string]: unknown
}

/** GET /partner/v1/merchants/{merchantID}/store/status — open/paused + reasons. */
export interface GrabStoreStatus {
  isOpened?: boolean
  gasStatus?: string
  [key: string]: unknown
}

export interface GrabCancelableResponse {
  cancelAble?: boolean
  nonCancellationReason?: string | null
  limitType?: string
  limitTimes?: number
  cancelReasons?: Array<{ code: number; reason: string }>
}

export interface GrabSelfServeJourneyResponse {
  activationUrl: string
}

export type GrabCancelCode = 1001 | 1002 | 1003 | 1004
