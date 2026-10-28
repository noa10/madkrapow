'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useCartStore, type CartStore } from './cart'

/**
 * Which cart store the shared ordering components use.
 *
 * The storefront keeps the default (delivery/pickup) cart. The table-QR page
 * wraps its tree in a provider with an isolated per-table cart, so the menu
 * cards' in-cart badge and the quick-view add-to-cart both target the diner's
 * table order without duplicating the ordering logic.
 */
const CartStoreContext = createContext<CartStore>(useCartStore)

export function CartStoreProvider({
  store,
  children,
}: {
  store: CartStore
  children: ReactNode
}) {
  return (
    <CartStoreContext.Provider value={store}>
      {children}
    </CartStoreContext.Provider>
  )
}

/**
 * The cart store for the current surface.
 *
 * Consumers pass it to zustand's `useStore(instance, selector)` rather than
 * calling it as a hook — that keeps the store identity explicit and avoids a
 * hook-in-variable call the lint rules cannot verify.
 */
export function useCartStoreInstance(): CartStore {
  return useContext(CartStoreContext)
}
