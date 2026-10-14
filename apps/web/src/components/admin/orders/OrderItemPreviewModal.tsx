"use client"

import { useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/Skeleton"
import { getOrderDisplayCode } from "@/lib/utils/order-code"
import { formatMoney, orderTotalCents } from "@/lib/orders/money"
import type { Order } from "@/types/orders"
import { useOrderItemsQuery } from "@/app/admin/orders/hooks/useOrderItemsQuery"

interface OrderItemPreviewModalProps {
  open: boolean
  order: Order | null
  onClose: () => void
}

/** Skeleton rows shown while the lazy per-order item fetch is in flight. */
function ItemSkeletonRows() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  )
}

export function OrderItemPreviewModal({ open, order, onClose }: OrderItemPreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const { items, isLoading, error } = useOrderItemsQuery(open && order ? order.id : null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      dialog.showModal()
      dialog.focus()
    } else {
      dialog.close()
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose()
    },
    [onClose]
  )

  const totalCents = order ? orderTotalCents(order) : 0

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-item-preview-title"
      onClose={onClose}
      onClick={handleBackdropClick}
      className={cn(
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        "bg-transparent border-none p-0 m-auto",
        "max-w-md w-[calc(100%-2rem)]",
        "open:animate-fade-in-up"
      )}
    >
      <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-white/10 bg-card shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <h2
              id="order-item-preview-title"
              className="truncate font-semibold text-gold"
            >
              {order ? getOrderDisplayCode(order) : "Order items"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {order?.customer_name || "Guest customer"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close item preview"
            className="-m-1 shrink-0 rounded-lg p-2 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-gold/40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — internal scroll so a long order fits a 390px viewport */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <ItemSkeletonRows />
          ) : error ? (
            <p className="py-6 text-center text-sm text-red-400">
              Could not load items. {error}
            </p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No items on this order.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      width={36}
                      height={36}
                      sizes="36px"
                      className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-white/5 text-xs font-medium text-muted-foreground">
                      {item.quantity}×
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} ×{" "}
                      {item.unitPriceCents != null ? formatMoney(item.unitPriceCents) : "—"}
                    </p>
                  </div>
                  {item.unitPriceCents != null && (
                    <p className="flex-shrink-0 text-sm font-medium tabular-nums text-foreground">
                      {formatMoney(item.unitPriceCents * item.quantity)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — order total */}
        <div className="flex items-center justify-between border-t border-white/10 p-4">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-base font-semibold tabular-nums text-foreground">
            {formatMoney(totalCents)}
          </span>
        </div>
      </div>
    </dialog>
  )
}
