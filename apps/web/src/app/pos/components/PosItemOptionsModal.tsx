'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModifierGroup } from '@/components/menu/ModifierGroup'
import { SpecialInstructions } from '@/components/menu/SpecialInstructions'
import { MAX_QUANTITY, MIN_QUANTITY } from '@/components/menu/useItemOrder'
import { getUnsatisfiedRequiredGroupNames } from '@/lib/menu/required-options'
import type { PosCartModifier } from '@/lib/pos/cart'
import type { PosMenuItem, PosModifierGroup } from '../hooks/usePosData'

interface PosItemOptionsModalProps {
  item: PosMenuItem
  groups: PosModifierGroup[]
  onClose: () => void
  onAdd: (selection: {
    quantity: number
    modifiers: PosCartModifier[]
    notes: string
  }) => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/** Choose add-ons and a note for a POS dish, mirroring the online quick view. */
export function PosItemOptionsModal({
  item,
  groups,
  onClose,
  onAdd,
}: PosItemOptionsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // Do not return a cleanup that calls dialog.close(): React StrictMode's
    // dev-only setup → cleanup → setup cycle would close the dialog and fire
    // its `close` event, which the parent handles by clearing the item.
    if (!dialog.open) dialog.showModal()
  }, [])

  const unsatisfied = getUnsatisfiedRequiredGroupNames(groups, selectedByGroup)

  const selectedModifiers = useMemo<PosCartModifier[]>(() => {
    const selected: PosCartModifier[] = []
    for (const group of groups) {
      for (const modifierId of selectedByGroup[group.id] ?? []) {
        const modifier = group.modifiers.find((entry) => entry.id === modifierId)
        if (modifier) {
          selected.push({
            id: modifier.id,
            name: modifier.name,
            price_delta_cents: modifier.price_delta_cents,
          })
        }
      }
    }
    return selected
  }, [groups, selectedByGroup])

  const unitCents = selectedModifiers.reduce(
    (sum, modifier) => sum + modifier.price_delta_cents,
    item.price_cents
  )
  const totalCents = unitCents * quantity

  const handleAdd = () => {
    if (unsatisfied.length > 0) {
      setError(`Please select: ${unsatisfied.join(', ')}`)
      return
    }
    onAdd({ quantity, modifiers: selectedModifiers, notes: notes.trim() })
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-lg border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[92dvh] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {item.image_url ? (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-sunk">
                <Image
                  src={item.image_url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-foreground">{item.name}</h2>
              <p className="text-xs tabular-nums text-ember-text">
                {formatPrice(item.price_cents)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close options"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {item.description && (
            <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
          )}

          {groups.map((group) => (
            <ModifierGroup
              key={group.id}
              group={group}
              selectedModifiers={selectedByGroup[group.id] ?? []}
              onChange={(ids) =>
                setSelectedByGroup((previous) => ({ ...previous, [group.id]: ids }))
              }
            />
          ))}

          <SpecialInstructions value={notes} onChange={setNotes} />

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-white/10 px-5 py-3">
          <div className="inline-flex h-11 flex-none items-center overflow-hidden rounded-lg border border-border-2">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(MIN_QUANTITY, value - 1))}
              disabled={quantity <= MIN_QUANTITY}
              aria-label="Decrease quantity"
              className="grid h-full w-10 place-items-center text-foreground hover:bg-surface-2 disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-sm font-extrabold tabular-nums text-foreground">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(MAX_QUANTITY, value + 1))}
              disabled={quantity >= MAX_QUANTITY}
              aria-label="Increase quantity"
              className="grid h-full w-10 place-items-center text-foreground hover:bg-surface-2 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <Button
            onClick={handleAdd}
            disabled={unsatisfied.length > 0}
            className="min-h-11 flex-1 rounded-full text-[15px] font-bold"
          >
            {unsatisfied.length > 0 ? (
              'Choose required options'
            ) : (
              `Add ${quantity} · ${formatPrice(totalCents)}`
            )}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
