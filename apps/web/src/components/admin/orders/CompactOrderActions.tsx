"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Package, BadgeDollarSign, ChefHat, Ban } from "lucide-react"
import { cn } from "@/lib/utils"
import { InlineSpinner } from "@/components/ui/InlineSpinner"
import { ConfirmModal } from "@/components/ui/ConfirmModal"
import { useToastStore } from "@/stores/toast"
import { differenceInMinutes, parseISO } from "date-fns"

interface FlowStep {
  status: string
  label: string
  shortLabel: string
  icon: React.ElementType
  next: string
}

const STATUS_FLOW: FlowStep[] = [
  { status: "pending", label: "Mark as Paid", shortLabel: "Pay", icon: BadgeDollarSign, next: "paid" },
  { status: "paid", label: "Start Preparing", shortLabel: "Prepare", icon: ChefHat, next: "preparing" },
  { status: "preparing", label: "Mark Ready", shortLabel: "Ready", icon: Package, next: "ready" },
]

const CANCELLABLE_STATUSES = ["pending", "paid", "preparing", "ready", "accepted"]
const TERMINAL_STATUSES = ["picked_up", "delivered", "cancelled", "completed"]

type ModalState =
  | { type: "cancel" }
  | { type: "ready-warning"; createdAt: string }
  | null

interface CompactOrderActionsProps {
  orderId: string
  currentStatus: string
  createdAt: string
  onStatusChange?: (newStatus: string) => void
  variant?: "card" | "row" | "table"
}

export function CompactOrderActions({
  orderId,
  currentStatus,
  createdAt,
  onStatusChange,
  variant = "row",
}: CompactOrderActionsProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const effectiveStatus = optimisticStatus ?? currentStatus

  const currentStep = STATUS_FLOW.find((s) => s.status === effectiveStatus)
  const canForward = currentStep !== undefined
  const canCancel = CANCELLABLE_STATUSES.includes(effectiveStatus)
  const isTerminal = TERMINAL_STATUSES.includes(effectiveStatus)

  const doTransition = useCallback(
    async (targetStatus: string, note?: string) => {
      // Optimistic update
      setOptimisticStatus(targetStatus)

      try {
        const body: Record<string, string> = { status: targetStatus }
        if (note) body.note = note

        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          const err = await response.json().catch(() => null)
          // Revert optimistic
          setOptimisticStatus(null)
          addToast({
            type: "error",
            title: "Status update failed",
            description: err?.error || `HTTP ${response.status}`,
          })
          return
        }

        onStatusChange?.(targetStatus)

        if (targetStatus === "cancelled") {
          addToast({ type: "success", title: "Refund initiated" })
        } else {
          addToast({
            type: "success",
            title: `Order marked as ${targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1)}`,
          })
        }
      } catch (err) {
        // Revert optimistic
        setOptimisticStatus(null)
        addToast({
          type: "error",
          title: "Network error",
          description: err instanceof Error ? err.message : "Please try again",
        })
      } finally {
        setLoading(null)
        setModalLoading(false)
      }
    },
    [orderId, onStatusChange, addToast]
  )

  const handleForwardClick = useCallback(() => {
    if (!currentStep) return
    const next = currentStep.next

    // Ready within 5 minutes — show warning
    if (next === "ready" && differenceInMinutes(new Date(), parseISO(createdAt)) < 5) {
      setModal({ type: "ready-warning", createdAt })
      return
    }

    setLoading(next)
    doTransition(next)
  }, [currentStep, createdAt, doTransition])

  const handleCancelClick = useCallback(() => {
    setModal({ type: "cancel" })
  }, [])

  const handleModalConfirm = useCallback(
    (note?: string) => {
      setModalLoading(true)
      if (modal?.type === "cancel") {
        doTransition("cancelled", note)
      } else if (modal?.type === "ready-warning") {
        doTransition("ready", note)
      }
      setModal(null)
    },
    [modal, doTransition]
  )

  if (isTerminal || (!canForward && !canCancel)) return null

  const ForwardIcon = currentStep?.icon ?? Package
  const isRow = variant === "row" || variant === "table"

  return (
    <>
      <div
        className={cn("flex items-center gap-1.5", !isRow && "mt-2")}
        onClick={(e) => e.stopPropagation()}
      >
        {canForward && (
          <Button
            size="sm"
            onClick={handleForwardClick}
            disabled={loading !== null}
            className={cn("gap-1.5 h-7 text-xs", isRow ? "px-2.5" : "px-2")}
          >
            {loading === currentStep.next ? (
              <InlineSpinner size="sm" />
            ) : (
              <ForwardIcon className="h-3 w-3" />
            )}
            {isRow ? currentStep.shortLabel : currentStep.label}
          </Button>
        )}

        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelClick}
            disabled={loading !== null}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          >
            {loading === "cancelled" ? (
              <InlineSpinner size="sm" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {modal?.type === "cancel" && (
        <ConfirmModal
          open
          onClose={() => setModal(null)}
          title="Cancel this order?"
          description="This order is paid. Cancelling will issue a refund."
          confirmLabel="Cancel Order"
          cancelLabel="Go Back"
          variant="danger"
          loading={modalLoading}
          requireNote
          noteMinLength={10}
          notePlaceholder="Reason for cancellation (min 10 chars)..."
          onConfirm={handleModalConfirm}
        />
      )}

      {/* Ready within 5 minutes warning modal */}
      {modal?.type === "ready-warning" && (
        <ConfirmModal
          open
          onClose={() => setModal(null)}
          title="Order placed less than 5 minutes ago"
          description="This order was just placed. Notify delivery provider now?"
          confirmLabel="Mark Ready"
          cancelLabel="Wait"
          variant="warning"
          loading={modalLoading}
          onConfirm={handleModalConfirm}
        />
      )}
    </>
  )
}
