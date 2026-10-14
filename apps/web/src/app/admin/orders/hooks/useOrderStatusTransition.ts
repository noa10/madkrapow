"use client"

import { useState, useCallback } from "react"
import { useToastStore } from "@/stores/toast"
import {
  getPrimaryAction,
  getCancelAvailability,
  isReadyTooEarly,
  type PrimaryAction,
} from "@/lib/orders/transition-ui"

export type OrderTransitionModal =
  | { type: "cancel" }
  | { type: "ready-warning"; createdAt: string }
  | null

interface UseOrderStatusTransitionArgs {
  orderId: string
  currentStatus: string
  createdAt: string
  onStatusChange?: (newStatus: string) => void
}

interface UseOrderStatusTransitionResult {
  effectiveStatus: string
  primaryAction: PrimaryAction | null
  canCancel: boolean
  isTerminal: boolean
  isLoading: boolean
  pendingTarget: string | null
  modal: OrderTransitionModal
  /** Opens the cancel-confirmation modal. */
  openCancel: () => void
  /**
   * Primary CTA handler. Applies the "ready within 5 minutes" warning gate:
   * when the next status is `ready` and the order was placed under 5 minutes
   * ago it opens the warning modal; otherwise it starts the transition
   * immediately. This is what the primary forward button should call.
   */
  handleForwardAction: () => void
  /** Confirm the currently-open modal, optionally with a note. */
  confirmModal: (note?: string) => void
  closeModal: () => void
  modalLoading: boolean
}

/**
 * Owns the admin order status-transition state machine: optimistic status
 * with rollback, toasts, and the cancel / ready-warning modal gates.
 *
 * Behaviour is identical to the logic previously inlined in the now-removed
 * `CompactOrderActions` row-action component.
 */
export function useOrderStatusTransition({
  orderId,
  currentStatus,
  createdAt,
  onStatusChange,
}: UseOrderStatusTransitionArgs): UseOrderStatusTransitionResult {
  const [loading, setLoading] = useState<string | null>(null)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
  const [modal, setModal] = useState<OrderTransitionModal>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  // The optimistic value is only a bridge until the server-provided status moves.
  // Once it does — our own refetch landing, or the kitchen advancing the order
  // over realtime — the server value wins, so a later update can never be masked
  // by a stale local status. Adjusting during render (rather than in an effect)
  // clears it in the same pass, so no stale pill is painted first.
  const [lastServerStatus, setLastServerStatus] = useState(currentStatus)
  if (currentStatus !== lastServerStatus) {
    setLastServerStatus(currentStatus)
    setOptimisticStatus(null)
  }

  const effectiveStatus = optimisticStatus ?? currentStatus

  const primaryAction = getPrimaryAction(effectiveStatus)
  const { canCancel, isTerminal } = getCancelAvailability(effectiveStatus)

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

  const handleForwardAction = useCallback(() => {
    if (!primaryAction) return
    const next = primaryAction.nextStatus

    // Ready within 5 minutes — warn before notifying the delivery provider
    if (next === "ready" && isReadyTooEarly(createdAt, new Date())) {
      setModal({ type: "ready-warning", createdAt })
      return
    }

    setLoading(next)
    doTransition(next)
  }, [primaryAction, createdAt, doTransition])

  const openCancel = useCallback(() => {
    setModal({ type: "cancel" })
  }, [])

  const closeModal = useCallback(() => {
    setModal(null)
  }, [])

  const confirmModal = useCallback(
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

  return {
    effectiveStatus,
    primaryAction,
    canCancel,
    isTerminal,
    isLoading: loading !== null,
    pendingTarget: loading,
    modal,
    openCancel,
    handleForwardAction,
    confirmModal,
    closeModal,
    modalLoading,
  }
}
