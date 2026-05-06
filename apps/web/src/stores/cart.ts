import { create } from 'zustand'
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

type CartState = {
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

const getModifierKey = (modifiers: SelectedModifier[]): string => {
  return [...modifiers].sort((a, b) => a.id.localeCompare(b.id)).map((m) => m.id).join(',')
}

const findItemIndex = (items: CartItem[], menuItemId: string, modifierIds: string[]): number => {
  return items.findIndex(
    (item) =>
      item.menu_item_id === menuItemId &&
      getModifierKey(item.selected_modifiers) === getModifierKey(
        modifierIds.map((id) => ({ id, name: '', price_delta_cents: 0 }))
      )
  )
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
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
        set((state) => ({
          items: state.items.filter(
            (item, index) =>
              index !== findItemIndex(state.items, menuItemId, modifierIds)
          ),
        }))
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
    }),
    {
      name: 'cart-storage',
      partialize: (state) => ({ items: state.items, includeCutlery: state.includeCutlery, appliedPromos: state.appliedPromos }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true
        }
      },
    }
  )
)
