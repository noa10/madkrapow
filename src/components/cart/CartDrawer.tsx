'use client'

import { useEffect } from 'react'
import { X, ShoppingCart } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { CartItem } from './CartItem'
import { CartSummary } from './CartSummary'
import { Button } from '@/components/ui/button'

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)

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

  const subtotal = getSubtotal()

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
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
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">Your cart is empty</p>
                <Button variant="link" onClick={onClose} className="mt-2">
                  Browse menu
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {items.map((item, index) => (
                  <CartItem
                    key={`${item.menu_item_id}-${index}`}
                    item={item}
                    itemName={item.menu_item_id}
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
