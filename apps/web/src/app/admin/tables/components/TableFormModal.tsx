'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RestaurantTable } from '@/lib/pos/types'

interface TableFormModalProps {
  open: boolean
  table: RestaurantTable | null
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  label: string
  zone: string
  seats: string
  sort_order: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  label: '',
  zone: '',
  seats: '2',
  sort_order: '0',
  is_active: true,
}

function toFormState(table: RestaurantTable | null): FormState {
  if (!table) return EMPTY_FORM
  return {
    label: table.label,
    zone: table.zone ?? '',
    seats: String(table.seats),
    sort_order: String(table.sort_order),
    is_active: table.is_active,
  }
}

/** Create/edit a floor table. Native <dialog> matches the admin conventions. */
export function TableFormModal({ open, table, onClose, onSaved }: TableFormModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<FormState>(toFormState(table))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setError(null)

    const seats = Number(form.seats)
    const sortOrder = Number(form.sort_order)
    if (!Number.isInteger(seats) || seats < 1 || seats > 50) {
      setError('Seats must be a whole number between 1 and 50')
      return
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError('Sort order must be zero or greater')
      return
    }

    setSaving(true)
    try {
      const payload = {
        label: form.label.trim(),
        zone: form.zone.trim() || null,
        seats,
        sort_order: sortOrder,
        is_active: form.is_active,
      }
      const res = await fetch(
        table ? `/api/admin/tables/${table.id}` : '/api/admin/tables',
        {
          method: table ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `Request failed (HTTP ${res.status})`)
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md border-none bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-card p-6 text-foreground shadow-2xl shadow-black/40"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {table ? `Edit ${table.label}` : 'Add table'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A QR code is generated automatically for every table.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="table-label" className="text-foreground">
              Table label
            </Label>
            <Input
              id="table-label"
              value={form.label}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, label: event.target.value }))
              }
              placeholder="T1, Patio 3, VIP…"
              maxLength={40}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="table-zone" className="text-foreground">
                Zone (optional)
              </Label>
              <Input
                id="table-zone"
                value={form.zone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, zone: event.target.value }))
                }
                placeholder="Indoor"
                maxLength={60}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="table-seats" className="text-foreground">
                Seats
              </Label>
              <Input
                id="table-seats"
                type="number"
                min={1}
                max={50}
                value={form.seats}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, seats: event.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="table-sort" className="text-foreground">
                Sort order
              </Label>
              <Input
                id="table-sort"
                type="number"
                min={0}
                max={9999}
                value={form.sort_order}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sort_order: event.target.value }))
                }
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_active: event.target.checked }))
                }
                className="h-4 w-4 rounded border-border bg-white/5"
              />
              Accepting QR orders
            </label>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving || !form.label.trim()}
            className="disabled:bg-primary/40 disabled:text-white/75 disabled:opacity-100"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save table'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
