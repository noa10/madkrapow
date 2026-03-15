'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { CartItem } from '@/components/cart/CartItem'
import { CartSummary } from '@/components/cart/CartSummary'
import { Button } from '@/components/ui/button'
import { getMenuItems, type MenuItem } from '@/lib/queries/menu-client'

export default function CartPage() {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const subtotal = useMemo(() => getSubtotal(), [getSubtotal])

  useEffect(() => {
    async function fetchMenuItems() {
      try {
        const items = await getMenuItems()
        setMenuItems(items)
      } catch (error) {
        console.error('Failed to fetch menu items:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchMenuItems()
  }, [])

  const menuItemMap = useMemo(() => {
    return menuItems.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {} as Record<string, MenuItem>)
  }, [menuItems])

  const isEmpty = items.length === 0

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-md mx-auto">
        <header className="sticky top-0 z-10 bg-background border-b px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Your Cart</h1>
            {!isEmpty && (
              <span className="text-sm text-muted-foreground ml-auto">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>
        </header>

        {isLoading ? (
          <div className="p-4 flex items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <ShoppingBag className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground text-center mb-6">
              Looks like you haven&apos;t added any items yet.
            </p>
            <Link href="/">
              <Button>Start Shopping</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="p-4">
              {items.map((item, index) => (
                <CartItem
                  key={`${item.menu_item_id}-${index}`}
                  item={item}
                  itemName={menuItemMap[item.menu_item_id]?.name || `Item ${item.menu_item_id.slice(0, 8)}`}
                />
              ))}
            </div>

            <CartSummary subtotal={subtotal} minOrderAmount={0} />

            <div className="p-4 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                Continue Shopping
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
