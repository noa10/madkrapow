'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, MapPin, Loader2 } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useCheckoutStore, type DeliveryAddress } from '@/stores/checkout'
import { getMenuItems, type MenuItem } from '@/lib/queries/menu-client'
import { Button } from '@/components/ui/button'

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

function formatAddress(address: DeliveryAddress): string {
  const parts = [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
  ].filter(Boolean)
  return parts.join(', ')
}

interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
  image?: string
  modifiers?: Array<{ name: string; price_delta_cents: number }>
}

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const clearCart = useCartStore((state) => state.clear)
  
  const deliveryAddress = useCheckoutStore((state) => state.delivery_address)
  const deliveryQuote = useCheckoutStore((state) => state.delivery_quote)
  
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [isLoadingMenu, setIsLoadingMenu] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subtotal = useMemo(() => getSubtotal(), [getSubtotal])
  const deliveryFee = deliveryQuote?.fee_cents ?? 0
  const total = subtotal + deliveryFee

  const menuItemMap = useMemo(() => {
    return menuItems.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {} as Record<string, MenuItem>)
  }, [menuItems])

  const checkoutItems: CheckoutItem[] = useMemo(() => {
    return items.map((item) => {
      const menuItem = menuItemMap[item.menu_item_id]
      return {
        id: item.menu_item_id,
        name: menuItem?.name || `Item ${item.menu_item_id.slice(0, 8)}`,
        price: item.unit_price + item.selected_modifiers.reduce((sum, mod) => sum + mod.price_delta_cents, 0),
        quantity: item.quantity,
        image: menuItem?.image_url || undefined,
        modifiers: item.selected_modifiers.map((mod) => ({
          name: mod.name,
          price_delta_cents: mod.price_delta_cents,
        })),
      }
    })
  }, [items, menuItemMap])

  useEffect(() => {
    async function fetchMenuItems() {
      try {
        const items = await getMenuItems()
        setMenuItems(items)
      } catch (err) {
        console.error('Failed to fetch menu items:', err)
      } finally {
        setIsLoadingMenu(false)
      }
    }
    fetchMenuItems()
  }, [])

  const isCartEmpty = items.length === 0
  const hasDeliveryAddress = !!deliveryAddress
  const canCheckout = !isCartEmpty && hasDeliveryAddress && deliveryFee >= 0

  const handlePayNow = async () => {
    if (!canCheckout || isProcessing) return

    setIsProcessing(true)
    setError(null)

    try {
      const payload = {
        items: checkoutItems.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price / 100,
          quantity: item.quantity,
          image: item.image,
        })),
        deliveryAddress: {
          fullName: deliveryAddress!.full_name || '',
          phone: deliveryAddress!.phone || '',
          address: formatAddress(deliveryAddress!),
          postalCode: deliveryAddress!.postal_code || '',
          city: deliveryAddress!.city || '',
          state: deliveryAddress!.state || '',
        },
        deliveryFee: deliveryFee / 100,
      }

      const response = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      clearCart()
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('Checkout error:', err)
      setError(err instanceof Error ? err.message : 'Failed to process checkout')
      setIsProcessing(false)
    }
  }

  if (isLoadingMenu) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-md mx-auto p-4 flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </main>
    )
  }

  if (isCartEmpty) {
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
              <h1 className="text-xl font-semibold">Checkout</h1>
            </div>
          </header>
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <p className="text-muted-foreground text-center mb-6">
              Your cart is empty. Add some items first.
            </p>
            <Link href="/">
              <Button>Browse Menu</Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-md mx-auto">
        <header className="sticky top-0 z-10 bg-background border-b px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/cart">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Checkout</h1>
          </div>
        </header>

        <div className="p-4 space-y-6">
          <section>
            <h2 className="text-lg font-semibold mb-3">Order Summary</h2>
            <div className="space-y-3">
              {checkoutItems.map((item, index) => (
                <div key={`${item.id}-${index}`} className="flex gap-3 text-sm">
                  {item.image ? (
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md bg-muted flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.quantity}x</span>
                      <span>{item.name}</span>
                    </div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="text-muted-foreground text-xs ml-6">
                        {item.modifiers.map((mod) => mod.name).join(', ')}
                      </div>
                    )}
                  </div>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Delivery Address</h2>
            {hasDeliveryAddress ? (
              <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{deliveryAddress.full_name}</p>
                  <p className="text-sm text-muted-foreground">{deliveryAddress.phone}</p>
                  <p className="text-sm text-muted-foreground">{formatAddress(deliveryAddress)}</p>
                </div>
              </div>
            ) : (
              <div className="text-center p-4 border border-dashed rounded-lg">
                <p className="text-muted-foreground mb-3">No delivery address set</p>
                <Link href="/">
                  <Button variant="outline" size="sm">
                    Add Delivery Address
                  </Button>
                </Link>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">Payment Details</h2>
            <div className="space-y-2 border-t pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery Fee</span>
                <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : 'Calculated at checkout'}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t pt-2">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
          </section>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handlePayNow}
            disabled={!canCheckout || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Pay ${formatPrice(total)}`
            )}
          </Button>
        </div>
      </div>
    </main>
  )
}
