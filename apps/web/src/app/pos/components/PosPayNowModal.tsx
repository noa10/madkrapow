'use client'

import { useEffect, useRef } from 'react'
import { Banknote, Check, Loader2, QrCode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PosPaymentMethod } from './PosSalePanel'
import { CompanyQrPanel } from './CompanyQrPanel'

interface PosPayNowModalProps {
  open: boolean
  method: PosPaymentMethod
  amountCents: number
  label?: string
  busy: boolean
  /** Server-side failure from the last attempt; stays visible so it is not missed. */
  error?: string | null
  onClose: () => void
  onConfirm: () => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * Take payment for a pay-now sale before the order is created.
 *
 * Both methods confirm explicitly in the top layer: cash ("Cash received")
 * and company QR ("Payment received"). The order is only created after the
 * cashier confirms, and a failure is shown inside the dialog — a toast alone
 * can sit underneath a modal dialog's backdrop and look like nothing happened.
 */
export function PosPayNowModal({
  open,
  method,
  amountCents,
  label,
  busy,
  error,
  onClose,
  onConfirm,
}: PosPayNowModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  const isCash = method === 'cash'

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="pos-pay-now-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="pos-pay-now-title"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              {isCash ? (
                <Banknote className="h-4 w-4 text-emerald-400" />
              ) : (
                <QrCode className="h-4 w-4 text-primary" />
              )}
              {isCash ? 'Collect cash' : 'Scan to pay'}
            </h2>
            {label && <p className="mt-1 text-xs text-muted-foreground">{label}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isCash ? (
          <div className="mt-4 space-y-3">
            <p className="text-center text-3xl font-extrabold tabular-nums text-foreground">
              {formatPrice(amountCents)}
            </p>
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center text-xs leading-5 text-muted-foreground">
              Take the cash from the customer, then confirm. The order is sent to
              the kitchen and recorded as paid.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <CompanyQrPanel amountCents={amountCents} />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 flex-1"
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="min-h-11 flex-1 font-bold">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isCash ? 'Cash received' : 'Payment received'}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
