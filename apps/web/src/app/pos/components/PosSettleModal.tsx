'use client'

import { useEffect, useRef } from 'react'
import { Banknote, Loader2, QrCode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PosOpenOrder } from '@/lib/pos/types'

interface PosSettleModalProps {
  order: PosOpenOrder | null
  busy: boolean
  onClose: () => void
  onConfirm: (method: 'cash' | 'qr_pay') => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/** Collect payment for an unpaid table-QR order. */
export function PosSettleModal({ order, busy, onClose, onConfirm }: PosSettleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (order) dialog.showModal()
    else dialog.close()
  }, [order])

  useEffect(() => {
    if (!order) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busy) onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [order, busy, onClose])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="rounded-xl border border-white/10 bg-card p-5 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Collect payment</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {order?.display_code ?? 'Order'}
              {order?.table_label ? ` · Table ${order.table_label}` : ''}
            </p>
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

        <p className="mt-4 text-center text-3xl font-extrabold tabular-nums text-foreground">
          {order ? formatPrice(order.total_cents) : '—'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => onConfirm('cash')}
            disabled={busy}
            className="min-h-12"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            Cash
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm('qr_pay')}
            disabled={busy}
            className="min-h-12"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            QR Pay
          </Button>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          The order moves to the kitchen queue as paid.
        </p>
      </div>
    </dialog>
  )
}
