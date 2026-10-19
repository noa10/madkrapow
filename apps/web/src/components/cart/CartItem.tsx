'use client'

import { memo, useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuantitySelector } from '@/components/menu/QuantitySelector'
import { useCartStore, type CartItem as StoreCartItem } from '@/stores/cart'

interface CartItemProps {
  item: StoreCartItem
  itemName: string
  imageUrl?: string | null
}

const SWIPE_THRESHOLD = 100

export const CartItem = memo(function CartItem({ item, itemName, imageUrl }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const [isDeleting, setIsDeleting] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchCurrent, setTouchCurrent] = useState<number | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  const modifierIds = item.selected_modifiers.map((m) => m.id)

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemove()
      return
    }
    updateQuantity(item.menu_item_id, modifierIds, newQuantity)
  }

  const handleRemove = () => {
    setIsDeleting(true)
    setTimeout(() => {
      removeItem(item.menu_item_id, modifierIds)
    }, 300)
  }

  const modifierTotal = item.selected_modifiers.reduce(
    (sum, mod) => sum + mod.price_delta_cents,
    0
  )
  const discount = item.discount_per_unit_cents ?? 0
  const itemTotal = item.quantity * (item.unit_price - discount + modifierTotal)
  const modifierSummary = item.selected_modifiers.map((m) => m.name).join(' · ')

  const formatPrice = (cents: number) => {
    return `RM${(cents / 100).toFixed(2)}`
  }



  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
    setTouchCurrent(e.touches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchCurrent(e.touches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (touchStart !== null && touchCurrent !== null) {
      const diff = touchStart - touchCurrent
      if (diff > SWIPE_THRESHOLD) {
        handleRemove()
      }
    }
    setTouchStart(null)
    setTouchCurrent(null)
  }

  useEffect(() => {
    if (touchStart !== null && itemRef.current) {
      const diff = touchStart - (touchCurrent || touchStart)
      const translateX = Math.max(0, diff)
      itemRef.current.style.transform = `translateX(${translateX}px)`
      itemRef.current.style.transition = 'none'
    } else if (itemRef.current) {
      itemRef.current.style.transform = ''
      itemRef.current.style.transition = 'transform 0.2s ease-out'
    }
  }, [touchCurrent, touchStart])

  const swipeProgress = touchStart !== null && touchCurrent !== null
    ? Math.min(1, Math.max(0, (touchStart - touchCurrent) / SWIPE_THRESHOLD))
    : 0

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 ${
        isDeleting ? 'opacity-0 -translate-x-4 max-h-0 border-0 py-0 my-0' : 'py-0 my-0'
      }`}
    >
      <div
        ref={itemRef}
        className="flex items-start gap-3 p-3"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={itemName}
            width={56}
            height={56}
            sizes="56px"
            className="h-14 w-14 flex-shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="h-14 w-14 flex-shrink-0 rounded-xl bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-bold">{itemName}</h4>
              {modifierSummary && (
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {modifierSummary}
                </p>
              )}
              {item.special_instructions && (
                <p className="text-xs italic text-muted-foreground">
                  &ldquo;{item.special_instructions}&rdquo;
                </p>
              )}
            </div>
            <div className="flex-shrink-0 text-right">
              {discount > 0 ? (
                <div>
                  <span className="block text-xs text-muted-foreground line-through">
                    {formatPrice(item.quantity * (item.unit_price + modifierTotal))}
                  </span>
                  <span className="block text-[15px] font-extrabold tabular-nums text-herb-text">
                    {formatPrice(itemTotal)}
                  </span>
                </div>
              ) : (
                <span className="whitespace-nowrap text-[15px] font-extrabold tabular-nums text-ember-text">
                  {formatPrice(itemTotal)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex min-h-[44px] items-center">
              <QuantitySelector
                quantity={item.quantity}
                onChange={handleQuantityChange}
                min={0}
                max={10}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRemove}
              className="h-11 w-11 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
})
