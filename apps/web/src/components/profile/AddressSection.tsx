"use client"

import { useState, useCallback } from "react"
import { MapPin, Plus, Pencil, Trash2, Star, Loader2, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToastStore } from "@/stores/toast"

interface CustomerAddress {
  id: string
  label: string | null
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  is_default: boolean
}

interface AddressSectionProps {
  customerId: string
  addresses: CustomerAddress[]
  onUpdate: () => void
}

const MALAYSIAN_STATES = [
  'Kuala Lumpur', 'Selangor', 'Putrajaya', 'Johor', 'Kedah', 'Kelantan',
  'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Terengganu', 'Labuan'
]

export function AddressSection({ customerId: _customerId, addresses, onUpdate }: AddressSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    label: '',
    address_line1: '',
    address_line2: '',
    city: 'Shah Alam',
    state: 'Selangor',
    postal_code: '',
    country: 'Malaysia',
  })

  const resetForm = useCallback(() => {
    setForm({
      label: '',
      address_line1: '',
      address_line2: '',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '',
      country: 'Malaysia',
    })
  }, [])

  const startEdit = (addr: CustomerAddress) => {
    setForm({
      label: addr.label || '',
      address_line1: addr.address_line1,
      address_line2: addr.address_line2 || '',
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code,
      country: addr.country,
    })
    setEditingId(addr.id)
    setIsAdding(false)
  }

  const handleSave = useCallback(async () => {
    if (!form.address_line1.trim() || !form.city.trim() || !form.state.trim() || !form.postal_code.trim()) {
      addToast({ type: "error", title: "Required fields missing", description: "Please fill in all required fields", duration: 3000 })
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        label: form.label.trim() || null,
        address_line1: form.address_line1.trim(),
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim(),
        state: form.state.trim(),
        postal_code: form.postal_code.trim(),
        country: form.country.trim() || 'Malaysia',
      }

      const url = editingId ? `/api/customer/addresses/${editingId}` : '/api/customer/addresses'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || `Failed to ${editingId ? 'update' : 'add'} address`)
      }

      addToast({ type: "success", title: editingId ? "Address updated" : "Address added", duration: 3000 })
      setIsAdding(false)
      setEditingId(null)
      resetForm()
      onUpdate()
    } catch (err) {
      addToast({
        type: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [form, editingId, onUpdate, addToast, resetForm])

  const handleDelete = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/customer/addresses/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to delete address")
      }
      addToast({ type: "success", title: "Address deleted", duration: 3000 })
      setDeleteId(null)
      onUpdate()
    } catch (err) {
      addToast({
        type: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [onUpdate, addToast])

  const handleSetDefault = useCallback(async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/customer/addresses/${id}/default`, { method: 'PATCH' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to set default")
      }
      addToast({ type: "success", title: "Default address updated", duration: 3000 })
      onUpdate()
    } catch (err) {
      addToast({
        type: "error",
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [onUpdate, addToast])

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const isEditing = isAdding || editingId !== null

  return (
    <div className="rounded-xl border border-white/8 bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
            <MapPin className="h-4 w-4 text-sky-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground font-heading tracking-wide">Saved Addresses</h3>
        </div>
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={() => { setIsAdding(true); setEditingId(null); resetForm() }}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {isEditing && (
        <div className="space-y-3 mb-4 p-4 rounded-lg border border-white/5 bg-white/[0.02]">
          <Input value={form.label} onChange={(e) => updateField('label', e.target.value)} placeholder="Label (e.g. Home, Office)" className="bg-background/50" />
          <Input value={form.address_line1} onChange={(e) => updateField('address_line1', e.target.value)} placeholder="Address Line 1 *" className="bg-background/50" />
          <Input value={form.address_line2} onChange={(e) => updateField('address_line2', e.target.value)} placeholder="Address Line 2" className="bg-background/50" />
          <div className="grid grid-cols-2 gap-3">
            <Input value={form.postal_code} onChange={(e) => updateField('postal_code', e.target.value)} placeholder="Postal Code *" className="bg-background/50" />
            <Input value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="City *" className="bg-background/50" />
          </div>
          <select
            value={form.state}
            onChange={(e) => updateField('state', e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm appearance-none"
          >
            {MALAYSIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              {editingId ? 'Update' : 'Add'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setEditingId(null); resetForm() }} disabled={isLoading}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!addresses || addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No saved addresses yet</p>
      ) : (
        <div className="space-y-2.5">
          {addresses.map((address) => (
            <div key={address.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{address.label || 'Address'}</span>
                  {address.is_default && (
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">Default</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!address.is_default && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(address.id)} disabled={isLoading}>
                      <Star className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(address)} disabled={isLoading || isEditing}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(address.id)} disabled={isLoading || isEditing}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {address.address_line1}
                {address.address_line2 && `, ${address.address_line2}`}
              </p>
              <p className="text-xs text-muted-foreground/80 mt-0.5">{address.postal_code}, {address.city}, {address.state}</p>

              {deleteId === address.id && (
                <div className="mt-2 flex items-center gap-2 pt-2 border-t border-white/5">
                  <span className="text-xs text-muted-foreground">Delete this address?</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDelete(address.id)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Delete'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setDeleteId(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
