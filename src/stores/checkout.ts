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

type CheckoutState = {
  delivery_address: DeliveryAddress | null
  delivery_quote: DeliveryQuote | null
  setDeliveryAddress: (address: DeliveryAddress | null) => void
  setDeliveryQuote: (quote: DeliveryQuote | null) => void
  clearDelivery: () => void
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      delivery_address: null,
      delivery_quote: null,

      setDeliveryAddress: (address) => {
        set({ delivery_address: address })
      },

      setDeliveryQuote: (quote) => {
        set({ delivery_quote: quote })
      },

      clearDelivery: () => {
        set({ delivery_address: null, delivery_quote: null })
      },
    }),
    {
      name: 'checkout-storage',
    }
  )
)
