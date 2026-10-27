'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Banknote, Check, CreditCard, Loader2, QrCode, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PosOpenOrder } from '@/lib/pos/types'
import { CompanyQrPanel } from './CompanyQrPanel'

interface PosSettleModalProps {
  order: PosOpenOrder | null
  busy: boolean
  onClose: () => void
  onConfirm: (method: 'cash' | 'qr_pay') => void
}

type Stage = 'method' | 'qr'

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function orderContext(order: PosOpenOrder | null): string {
  if (!order) return ''
  if (order.table_label) return ` · Table ${order.table_label}`
  if (order.delivery_type === 'self_pickup') {
    return ` · Take-away${order.customer_name ? ` · ${order.customer_name}` : ''}`
  }
  return ''
}

/** Collect payment for an unpaid POS order (table QR, pay-later dine-in or take-away). */
export function PosSettleModal({ order, busy, onClose, onConfirm }: PosSettleModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [stage, setStage] = useState<Stage>('method')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (order) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
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

  const close = () => {
    if (busy) return
    setStage('method')
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) close()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="rounded-xl border border-border bg-card p-5 text-foreground shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {stage === 'qr' ? 'Scan to pay' : 'Collect payment'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {order?.display_code ?? 'Order'}
              {orderContext(order)}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === 'qr' ? (
          <>
            <div className="mt-4">
              <CompanyQrPanel
                amountCents={order?.total_cents ?? 0}
                note="Confirm only after the customer shows a successful payment."
              />
            </div>
            <div className="mt-5 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStage('method')}
                disabled={busy}
                className="min-h-11 flex-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => onConfirm('qr_pay')}
                disabled={busy}
                className="min-h-11 flex-1 font-bold"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Payment received
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-3xl font-extrabold tabular-nums text-foreground">
              {order ? formatPrice(order.total_cents) : '—'}
            </p>

            <div className="mt-5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => onConfirm('cash')}
                  disabled={busy}
                  className="min-h-12"
                >
                  <Banknote className="h-4 w-4" />
                  Cash
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStage('qr')}
                  disabled={busy}
                  className="min-h-12"
                >
                  <QrCode className="h-4 w-4" />
                  Company QR
                </Button>
              </div>
              <Button
                variant="outline"
                disabled
                title="Card terminal integration is coming soon"
                className="min-h-11 w-full opacity-50"
              >
                <CreditCard className="h-4 w-4" />
                Card terminal — coming soon
              </Button>
            </div>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              The order is marked paid and the kitchen is notified.
            </p>
          </>
        )}
      </div>
    </dialog>
  )
}
