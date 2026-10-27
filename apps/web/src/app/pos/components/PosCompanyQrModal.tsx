'use client'

import { useEffect, useRef } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CompanyQrPanel } from './CompanyQrPanel'

interface PosCompanyQrModalProps {
  open: boolean
  amountCents: number
  label?: string
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}

/** Pay-now confirmation: show the company QR, then record the payment. */
export function PosCompanyQrModal({
  open,
  amountCents,
  label,
  busy,
  onClose,
  onConfirm,
}: PosCompanyQrModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) dialog.showModal()
    else dialog.close()
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Scan to pay</h2>
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

        <div className="mt-4">
          <CompanyQrPanel amountCents={amountCents} />
        </div>

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
            Payment received
          </Button>
        </div>
      </div>
    </dialog>
  )
}
