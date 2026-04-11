'use client'

import { useEffect, useState, useMemo } from 'react'
import { X, ShoppingCart } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { CartItem } from './CartItem'
import { CartSummary } from './CartSummary'
import { Button } from '@/components/ui/button'
import { getMenuItems, type MenuItem } from '@/lib/queries/menu-client'

export function CartDrawer() {
  const isHydrated = useCartStore((state) => state.isHydrated)
  const isOpen = useCartStore((state) => state.isDrawerOpen)
  const onClose = useCartStore((state) => state.closeDrawer)
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])

  useEffect(() => {
    getMenuItems()
      .then(setMenuItems)
      .catch((err) => console.error('Failed to fetch menu items:', err))
  }, [])

  const menuItemMap = useMemo(
    () => Object.fromEntries(menuItems.map((item) => [item.id, item])),
    [menuItems]
  )

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const subtotal = isHydrated ? getSubtotal() : 0
  const displayItems = isHydrated ? items : []

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b px-4 py-4">
            <h2 className="text-lg font-semibold">Your Cart</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {displayItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">Your cart is empty</p>
                <Button variant="link" onClick={onClose} className="mt-2">
                  Browse menu
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {displayItems.map((item, index) => (
                  <CartItem
                    key={`${item.menu_item_id}-${index}`}
                    item={item}
                    itemName={menuItemMap[item.menu_item_id]?.name ?? `Item ${item.menu_item_id.slice(0, 8)}`}
                    imageUrl={menuItemMap[item.menu_item_id]?.image_url}
                  />
                ))}
              </div>
            )}
          </div>

          <CartSummary subtotal={subtotal} minOrderAmount={0} />
        </div>
      </div>
    </>
  )
}
