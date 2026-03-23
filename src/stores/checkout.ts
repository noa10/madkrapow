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
  setDeliveryAddress: (address: DeliveryAddress | null) => void
  setDeliveryQuote: (quote: DeliveryQuote | null) => void
  setDeliveryType: (type: DeliveryType) => void
  setFulfillmentType: (type: FulfillmentType) => void
  setScheduledWindow: (window: ScheduledWindow | null) => void
  clearDelivery: () => void
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      delivery_address: null,
      delivery_quote: null,
      delivery_type: 'delivery',
      fulfillment_type: 'asap',
      scheduled_window: null,

      setDeliveryAddress: (address) => {
        set({ delivery_address: address })
      },

      setDeliveryQuote: (quote) => {
        set({ delivery_quote: quote })
      },

      setDeliveryType: (type) => {
        set({
          delivery_type: type,
          // Reset quote when switching to self-pickup (no delivery fee)
          delivery_quote: type === 'self_pickup' ? null : null,
        })
      },

      setFulfillmentType: (type) => {
        set({
          fulfillment_type: type,
          // Clear scheduled window when switching to ASAP
          scheduled_window: type === 'asap' ? null : null,
        })
      },

      setScheduledWindow: (window) => {
        set({ scheduled_window: window })
      },

      clearDelivery: () => {
        set({
          delivery_address: null,
          delivery_quote: null,
          delivery_type: 'delivery',
          fulfillment_type: 'asap',
          scheduled_window: null,
        })
      },
    }),
    {
      name: 'checkout-storage',
    }
  )
)
