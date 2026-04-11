import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DeliveryAddress = {
  full_name: string
  phone: string
  address_line1: string
  address_line2?: string
  city: string
  state: string
  postal_code: string
  country?: string
  latitude?: number
  longitude?: number
}

export type DeliveryQuoteFee = {
  fee_type: 'base' | 'distance' | 'peak' | 'small_order'
  amount_cents: number
  description: string
}

export type DeliveryQuote = {
  quote_id: string
  fee_cents: number
  estimated_pickup_time?: string
  estimated_delivery_time?: string
  expires_at: string
  fees: DeliveryQuoteFee[]
}

export type PriceBreakdown = {
  base: string
  total: string
  currency: string
  extraMileage?: string
  surcharge?: string
}

export type StopIds = {
  pickup: string
  dropoff: string
}

export type DeliveryType = 'delivery' | 'self_pickup'
export type FulfillmentType = 'asap' | 'scheduled'

export type ScheduledWindow = {
  date: string
  window_start: string
  window_end: string
  label: string
}

type CheckoutState = {
  delivery_address: DeliveryAddress | null
  delivery_quote: DeliveryQuote | null
  delivery_type: DeliveryType
  fulfillment_type: FulfillmentType
  scheduled_window: ScheduledWindow | null

  // v3 shipping fields
  service_type: string | null
  quotation_id: string | null
  stop_ids: StopIds | null
  quote_expires_at: string | null
  price_breakdown: PriceBreakdown | null

  setDeliveryAddress: (address: DeliveryAddress | null) => void
  setDeliveryQuote: (quote: DeliveryQuote | null) => void
  setDeliveryType: (type: DeliveryType) => void
  setFulfillmentType: (type: FulfillmentType) => void
  setScheduledWindow: (window: ScheduledWindow | null) => void
  setShippingQuote: (data: {
    quotation_id: string
    service_type: string
    stop_ids: StopIds
    quote_expires_at: string
    price_breakdown: PriceBreakdown
    fee_cents: number
  }) => void
  clearShippingQuote: () => void
  isQuoteExpired: () => boolean
  clearDelivery: () => void
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      delivery_address: null,
      delivery_quote: null,
      delivery_type: 'delivery',
      fulfillment_type: 'asap',
      scheduled_window: null,

      // v3 shipping fields
      service_type: null,
      quotation_id: null,
      stop_ids: null,
      quote_expires_at: null,
      price_breakdown: null,

      setDeliveryAddress: (address) => {
        set({ delivery_address: address })
      },

      setDeliveryQuote: (quote) => {
        set({ delivery_quote: quote })
      },

      setDeliveryType: (type) => {
        set({
          delivery_type: type,
          // Always clear shipping data when switching types — user needs fresh quote
          delivery_quote: null,
          quotation_id: null,
          stop_ids: null,
          quote_expires_at: null,
          price_breakdown: null,
          service_type: null,
        })
      },

      setFulfillmentType: (type) => {
        set({
          fulfillment_type: type,
          // Always clear scheduled window when switching types
          scheduled_window: null,
        })
      },

      setScheduledWindow: (window) => {
        set({ scheduled_window: window })
      },

      setShippingQuote: (data) => {
        set({
          quotation_id: data.quotation_id,
          service_type: data.service_type,
          stop_ids: data.stop_ids,
          quote_expires_at: data.quote_expires_at,
          price_breakdown: data.price_breakdown,
          delivery_quote: {
            quote_id: data.quotation_id,
            fee_cents: data.fee_cents,
            expires_at: data.quote_expires_at,
            fees: [],
          },
        })
      },

      clearShippingQuote: () => {
        set({
          quotation_id: null,
          stop_ids: null,
          quote_expires_at: null,
          price_breakdown: null,
          service_type: null,
          delivery_quote: null,
        })
      },

      isQuoteExpired: () => {
        const expiresAt = get().quote_expires_at
        if (!expiresAt) return true
        return new Date(expiresAt) <= new Date()
      },

      clearDelivery: () => {
        set({
          delivery_address: null,
          delivery_quote: null,
          delivery_type: 'delivery',
          fulfillment_type: 'asap',
          scheduled_window: null,
          service_type: null,
          quotation_id: null,
          stop_ids: null,
          quote_expires_at: null,
          price_breakdown: null,
        })
      },
    }),
    {
      name: 'checkout-storage',
    }
  )
)
