'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuantitySelector } from '@/components/menu/QuantitySelector'
import { useCartStore, type CartItem } from '@/stores/cart'

interface CartItemProps {
  item: CartItem
  itemName: string
  imageUrl?: string | null
}

const SWIPE_THRESHOLD = 100

export function CartItem({ item, itemName, imageUrl }: CartItemProps) {
  const { updateQuantity, removeItem } = useCartStore()
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
      className={`relative overflow-hidden rounded-xl border bg-card transition-all duration-300 ${
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
        <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground/40" />
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={itemName}
            width={56}
            height={56}
            sizes="56px"
            className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-lg bg-muted flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-medium text-sm">{itemName}</h4>
              {item.selected_modifiers.length > 0 && (
                <div className="mt-0.5">
                  {item.selected_modifiers.map((m) => (
                    <p key={m.id} className="text-xs text-muted-foreground leading-relaxed">
                      {m.name}{m.price_delta_cents > 0 ? ` (+${formatPrice(m.price_delta_cents)})` : ''}
                    </p>
                  ))}
                </div>
              )}
              {item.special_instructions && (
                <p className="text-xs text-muted-foreground italic">
                  &ldquo;{item.special_instructions}&rdquo;
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              {discount > 0 ? (
                <div>
                  <span className="text-xs text-muted-foreground line-through block">
                    {formatPrice(item.quantity * (item.unit_price + modifierTotal))}
                  </span>
                  <span className="font-medium text-sm text-primary block">
                    {formatPrice(itemTotal)}
                  </span>
                </div>
              ) : (
                <span className="font-medium text-sm whitespace-nowrap">
                  {formatPrice(itemTotal)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="min-h-[44px] flex items-center">
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
              className="h-11 w-11 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
