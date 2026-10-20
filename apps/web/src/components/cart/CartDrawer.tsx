'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { X, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { CartItem } from './CartItem'
import { CartSummary } from './CartSummary'
import { Button } from '@/components/ui/button'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { getMenuItems, type MenuItem } from '@/lib/queries/menu-client'

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

export function CartDrawer() {
  const isHydrated = useCartStore((state) => state.isHydrated)
  const isOpen = useCartStore((state) => state.isDrawerOpen)
  const onClose = useCartStore((state) => state.closeDrawer)
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const getDiscountTotal = useCartStore((state) => state.getDiscountTotal)
  const appliedPromos = useCartStore((state) => state.appliedPromos)
  const removePromo = useCartStore((state) => state.removePromo)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const menuItemsRequestedRef = useRef(false)
  const touchStartX = useRef<number | null>(null)

  // Menu data is only needed once the drawer is opened. The client query cache
  // makes subsequent opens free and concurrent mounts share one request.
  useEffect(() => {
    if (!isOpen || menuItemsRequestedRef.current) return

    menuItemsRequestedRef.current = true
    getMenuItems()
      .then(setMenuItems)
      .catch((err) => {
        menuItemsRequestedRef.current = false
        console.error('Failed to fetch menu items:', err)
      })
  }, [isOpen])

  const menuItemMap = useMemo(
    () => Object.fromEntries(menuItems.map((item) => [item.id, item])),
    [menuItems]
  )

  useBodyScrollLock(isOpen)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    // Swipe left more than 80px to close
    if (diff > 80) {
      onClose()
    }
    touchStartX.current = null
  }, [onClose])

  const subtotal = isHydrated ? getSubtotal() : 0
  const displayItems = isHydrated ? items : []
  const discountTotal = isHydrated ? getDiscountTotal() : 0
  const totalItems = displayItems.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-background shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
            <ShoppingBag className="h-[18px] w-[18px]" aria-hidden />
            <h2 className="flex-1 text-[15px] font-extrabold">Your order</h2>
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-foreground">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close cart"
              className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-foreground transition hover:bg-surface-3"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {displayItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-12">
                <ShoppingBag className="h-12 w-12 text-muted-foreground" />
                <p className="text-center text-sm text-muted-foreground">Your cart is empty</p>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="rounded-full border border-border-2 px-5 text-[13px] font-bold hover:bg-surface-2"
                >
                  Browse menu
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-3">
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

          {/* Applied promos */}
          {appliedPromos.length > 0 && (
            <div className="border-t border-border bg-surface-sunk px-4 py-3">
              <h3 className="mb-2 text-[13px] font-extrabold">Applied promos</h3>
              <div className="space-y-1">
                {appliedPromos.map((promo) => (
                  <div key={promo.code} className="flex items-center justify-between">
                    <span className="text-sm text-herb-text">
                      -{formatPrice(promo.discountCents)} ({promo.code})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 rounded-full px-2 text-xs text-muted-foreground hover:bg-surface-2"
                      onClick={() => removePromo(promo.code)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4">
            <CartSummary subtotal={subtotal - discountTotal} minOrderAmount={0} />
          </div>
        </div>
      </div>
    </>
  )
}
