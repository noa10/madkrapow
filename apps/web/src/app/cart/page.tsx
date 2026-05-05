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

  const subtotal = useMemo(() => getSubtotal(), [getSubtotal, items])

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
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-white/8 px-4 py-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold font-display">Your Cart</h1>
          {!isEmpty && (
            <span className="text-sm text-muted-foreground ml-auto">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </span>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        {isLoading ? (
          <div className="p-4 flex items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 animate-fade-in-up">
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mb-6">
              <ShoppingBag className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold font-display mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground text-center mb-8 max-w-xs">
              Looks like you haven&apos;t added any items yet.
            </p>
            <Link href="/">
              <Button size="lg" className="shadow-gold">
                Browse Menu
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 p-4">
            <div className="space-y-2">
              {items.map((item, index) => (
                <CartItem
                  key={`${item.menu_item_id}-${index}`}
                  item={item}
                  itemName={menuItemMap[item.menu_item_id]?.name || `Item ${item.menu_item_id.slice(0, 8)}`}
                  imageUrl={menuItemMap[item.menu_item_id]?.image_url}
                />
              ))}
            </div>

            <div className="lg:sticky lg:top-24 self-start">
              <CartSummary subtotal={subtotal} minOrderAmount={0} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
