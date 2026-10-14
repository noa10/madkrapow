"use client"

import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemDestructive,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { getOrderDisplayCode } from "@/lib/utils/order-code"
import { isPrintBridgeConfigured, printViaBridge } from "@/lib/printing/client"
import { useToastStore } from "@/stores/toast"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/orders"

interface OrderOverflowMenuProps {
  order: Order
  onOpenItems?: (order: Order) => void
  onCancel: () => void
  /** Cancel is offered only for statuses the server will actually accept. */
  canCancel: boolean
  disabled?: boolean
}

/**
 * The `•••` overflow control for an order card: view details, view items,
 * print receipt (only when the LAN print bridge is configured), and the
 * destructive cancel action. The trigger stops propagation so opening the
 * menu never navigates the surrounding card.
 *
 * Cancel is gated on `canCancel` so a terminal order (delivered / cancelled /
 * picked_up) never offers an action the status route rejects with a 400.
 */
export function OrderOverflowMenu({
  order,
  onOpenItems,
  onCancel,
  canCancel,
  disabled,
}: OrderOverflowMenuProps) {
  const router = useRouter()
  const addToast = useToastStore((s) => s.addToast)
  const displayCode = getOrderDisplayCode(order)
  const canPrint = isPrintBridgeConfigured()

  const handleViewDetails = () => {
    router.push(`/admin/orders/${order.id}`)
  }

  const handlePrint = async () => {
    const result = await printViaBridge(order.id, "receipt")
    if (result.ok) {
      addToast({ type: "success", title: "Receipt sent to printer" })
    } else {
      addToast({
        type: "error",
        title: "Print failed",
        description: result.error,
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`More options for order ${displayCode}`}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10",
          "text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40",
          "disabled:pointer-events-none disabled:opacity-50",
          "h-11 w-11 md:h-8 md:w-8"
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={handleViewDetails}>View details</DropdownMenuItem>
        {onOpenItems && (
          <DropdownMenuItem onSelect={() => onOpenItems(order)}>View items</DropdownMenuItem>
        )}
        {canPrint && <DropdownMenuItem onSelect={handlePrint}>Print receipt</DropdownMenuItem>}
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItemDestructive onSelect={onCancel}>
              Cancel order
            </DropdownMenuItemDestructive>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
