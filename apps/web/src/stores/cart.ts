import { create, type StateCreator } from 'zustand'
import { persist } from 'zustand/middleware'

export type SelectedModifier = {
  id: string
  name: string
  price_delta_cents: number
}

export type AppliedPromo = {
  code: string
  description: string
  scope: 'order' | 'delivery'
  discountType: 'percentage' | 'fixed'
  discountValue: number
  discountCents: number
}

export type CartItem = {
  menu_item_id: string
  quantity: number
  selected_modifiers: SelectedModifier[]
  special_instructions: string
  unit_price: number
  discount_per_unit_cents?: number
}

export type CartState = {
  items: CartItem[]
  isDrawerOpen: boolean
  isHydrated: boolean
  appliedPromos: AppliedPromo[]
  includeCutlery: boolean
  toggleDrawer: () => void
  openDrawer: () => void
  closeDrawer: () => void
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number; discount_per_unit_cents?: number }) => void
  getOriginalSubtotal: () => number
  removeItem: (menuItemId: string, modifierIds: string[]) => void
  updateQuantity: (menuItemId: string, modifierIds: string[], quantity: number) => void
  clear: () => void
  getTotalItems: () => number
  getSubtotal: () => number
  getDiscountTotal: () => number
  setDiscountPerItem: (menuItemId: string, discountCents: number) => void
  clearDiscounts: () => void
  applyPromo: (promo: AppliedPromo) => void
  removePromo: (code: string) => void
  clearPromos: () => void
  setIncludeCutlery: (value: boolean) => void
}

/** The store hook shape shared by the delivery cart and table carts. */
export type CartStore = ReturnType<typeof createCartStore>

const getModifierKey = (modifiers: SelectedModifier[]): string => {
  return [...modifiers].sort((a, b) => a.id.localeCompare(b.id)).map((m) => m.id).join(',')
}

const findItemIndex = (items: CartItem[], menuItemId: string, modifierIds: string[]): number => {
  const targetKey = getModifierKey(
    modifierIds.map((id) => ({ id, name: '', price_delta_cents: 0 }))
  )
  return items.findIndex(
    (item) =>
      item.menu_item_id === menuItemId &&
      getModifierKey(item.selected_modifiers) === targetKey
  )
}

const cartStateCreator: StateCreator<CartState> = (set, get) => ({
  items: [],
  isDrawerOpen: false,
  isHydrated: false,
  appliedPromos: [],
  includeCutlery: true,
  setIncludeCutlery: (value) => set({ includeCutlery: value }),
  toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),

  addItem: (item) => {
    const { menu_item_id, selected_modifiers, quantity = 1 } = item
    const modifierIds = selected_modifiers.map((m) => m.id)
    const existingIndex = findItemIndex(get().items, menu_item_id, modifierIds)

    if (existingIndex >= 0) {
      set((state) => {
        const newItems = [...state.items]
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + quantity,
        }
        return { items: newItems }
      })
    } else {
      set((state) => ({
        items: [...state.items, { ...item, quantity }],
      }))
    }
  },

  removeItem: (menuItemId, modifierIds) => {
    set((state) => {
      const index = findItemIndex(state.items, menuItemId, modifierIds)
      return {
        items: state.items.filter((_, itemIndex) => itemIndex !== index),
      }
    })
  },

  updateQuantity: (menuItemId, modifierIds, quantity) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId, modifierIds)
      return
    }

    set((state) => {
      const index = findItemIndex(state.items, menuItemId, modifierIds)
      if (index < 0) return state

      const newItems = [...state.items]
      newItems[index] = { ...newItems[index], quantity }
      return { items: newItems }
    })
  },

  clear: () => set({ items: [], appliedPromos: [] }),

  getTotalItems: () => {
    return get().items.reduce((sum, item) => sum + item.quantity, 0)
  },

  getSubtotal: () => {
    return get().items.reduce((sum, item) => {
      const modifierTotal = item.selected_modifiers.reduce(
        (modSum, mod) => modSum + mod.price_delta_cents,
        0
      )
      const discount = item.discount_per_unit_cents ?? 0
      return sum + item.quantity * (item.unit_price - discount + modifierTotal)
    }, 0)
  },

  getOriginalSubtotal: () => {
    return get().items.reduce((sum, item) => {
      const modifierTotal = item.selected_modifiers.reduce(
        (modSum, mod) => modSum + mod.price_delta_cents,
        0
      )
      return sum + item.quantity * (item.unit_price + modifierTotal)
    }, 0)
  },

  getDiscountTotal: () => {
    return get().appliedPromos.reduce((sum, promo) => sum + promo.discountCents, 0)
  },

  setDiscountPerItem: (menuItemId, discountCents) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.menu_item_id === menuItemId
          ? { ...item, discount_per_unit_cents: discountCents }
          : item
      ),
    }))
  },

  clearDiscounts: () => {
    set((state) => ({
      items: state.items.map((item) => ({ ...item, discount_per_unit_cents: 0 })),
    }))
  },

  applyPromo: (promo) => {
    const existing = get().appliedPromos.find(p => p.code === promo.code)
    if (!existing) {
      set((state) => ({ appliedPromos: [...state.appliedPromos, promo] }))
    }
  },

  removePromo: (code) => {
    set((state) => ({
      appliedPromos: state.appliedPromos.filter(p => p.code !== code)
    }))
  },

  clearPromos: () => {
    set({ appliedPromos: [] })
  },
})

/**
 * Build an isolated cart store backed by its own localStorage key.
 *
 * The delivery storefront and a table-QR session must never share lines: a
 * diner who scanned a table QR would otherwise submit their delivery cart (or
 * lose an in-progress delivery order when the table cart is cleared).
 */
export function createCartStore(storageKey: string) {
  return create<CartState>()(
    persist(cartStateCreator, {
      name: storageKey,
      partialize: (state) => ({ items: state.items, includeCutlery: state.includeCutlery, appliedPromos: state.appliedPromos }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true
        }
      },
    })
  )
}

/** The site-wide delivery/pickup cart. */
export const useCartStore = createCartStore('cart-storage')
