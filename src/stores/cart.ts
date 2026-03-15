import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SelectedModifier = {
  id: string
  name: string
  price_delta_cents: number
}

export type CartItem = {
  menu_item_id: string
  quantity: number
  selected_modifiers: SelectedModifier[]
  special_instructions: string
  unit_price: number
}

type CartState = {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void
  removeItem: (menuItemId: string, modifierIds: string[]) => void
  updateQuantity: (menuItemId: string, modifierIds: string[], quantity: number) => void
  clear: () => void
  getTotalItems: () => number
  getSubtotal: () => number
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

      clear: () => set({ items: [] }),

      getTotalItems: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0)
      },

      getSubtotal: () => {
        return get().items.reduce((sum, item) => {
          const modifierTotal = item.selected_modifiers.reduce(
            (modSum, mod) => modSum + mod.price_delta_cents,
            0
          )
          return sum + item.quantity * (item.unit_price + modifierTotal)
        }, 0)
      },
    }),
    {
      name: 'cart-storage',
    }
  )
)
