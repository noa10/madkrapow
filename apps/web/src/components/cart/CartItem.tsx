'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QuantitySelector } from '@/components/menu/QuantitySelector'
import { useCartStore, type CartItem, type SelectedModifier } from '@/stores/cart'

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
    }, 200)
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

  const getModifiersSummary = (modifiers: SelectedModifier[]) => {
    if (modifiers.length === 0) return null
    return modifiers.map((m) => m.name).join(', ')
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
    <div className="relative overflow-hidden">
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-center bg-destructive px-4 transition-opacity ${swipeProgress === 0 ? 'pointer-events-none' : ''}`}
        style={{ opacity: swipeProgress }}
      >
        <Trash2 className="h-5 w-5 text-destructive-foreground" />
      </div>
      <div
        ref={itemRef}
        className={`flex items-center gap-3 bg-background p-3 transition-opacity ${isDeleting ? 'opacity-0' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={itemName}
            width={48}
            height={48}
            className="h-12 w-12 rounded-md object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-md bg-muted flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-medium text-sm truncate">{itemName}</h4>
              {getModifiersSummary(item.selected_modifiers) && (
                <p className="text-xs text-muted-foreground truncate">
                  {getModifiersSummary(item.selected_modifiers)}
                </p>
              )}
              {item.special_instructions && (
                <p className="text-xs text-muted-foreground italic truncate">
                  &ldquo;{item.special_instructions}&rdquo;
                </p>
              )}
            </div>
            <div className="text-right">
              {discount > 0 ? (
                <div>
                  <span className="text-xs text-muted-foreground line-through block">
                    {formatPrice(item.quantity * (item.unit_price + modifierTotal))}
                  </span>
                  <span className="font-medium text-sm text-green-600 block">
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
            <QuantitySelector
              quantity={item.quantity}
              onChange={handleQuantityChange}
              min={0}
              max={10}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleRemove}
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:border-destructive"
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
