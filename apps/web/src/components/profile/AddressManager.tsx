"use client"

import { useState } from "react"
import { MapPin, Plus, Star, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
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

interface AddressManagerProps {
  customerId: string
  addresses: CustomerAddress[]
  onChange: () => void
}

const MALAYSIAN_STATES = [
  'Kuala Lumpur', 'Selangor', 'Putrajaya', 'Johor', 'Kedah', 'Kelantan',
  'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Terengganu', 'Labuan'
]

export function AddressManager({ customerId: _customerId, addresses, onChange }: AddressManagerProps) {
  const addToast = useToastStore((state) => state.addToast)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    label: '',
    address_line1: '',
    address_line2: '',
    city: 'Shah Alam',
    state: 'Selangor',
    postal_code: '',
    country: 'Malaysia',
  })

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const resetForm = () => {
    setFormData({
      label: '',
      address_line1: '',
      address_line2: '',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '',
      country: 'Malaysia',
    })
    setFormErrors({})
  }

  const startAdd = () => {
    resetForm()
    setIsAdding(true)
    setEditingId(null)
    setConfirmDeleteId(null)
  }

  const startEdit = (address: CustomerAddress) => {
    setFormData({
      label: address.label || '',
      address_line1: address.address_line1,
      address_line2: address.address_line2 || '',
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country || 'Malaysia',
    })
    setEditingId(address.id)
    setIsAdding(false)
    setConfirmDeleteId(null)
    setFormErrors({})
  }

  const cancelForm = () => {
    setIsAdding(false)
    setEditingId(null)
    resetForm()
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!formData.address_line1.trim()) errors.address_line1 = 'Address Line 1 is required'
    if (!formData.city.trim()) errors.city = 'City is required'
    if (!formData.state.trim()) errors.state = 'State is required'
    if (!formData.postal_code.trim()) errors.postal_code = 'Postal Code is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsLoading(true)

    try {
      const payload = {
        ...formData,
        label: formData.label.trim() || null,
        address_line2: formData.address_line2.trim() || null,
      }

      const url = editingId
        ? `/api/customer/addresses/${editingId}`
        : '/api/customer/addresses'

      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to save address')
      }

      addToast({
        type: 'success',
        title: editingId ? 'Address updated' : 'Address added',
        duration: 3000,
      })

      onChange()
      cancelForm()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save address',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/customer/addresses/${id}`, { method: 'DELETE' })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete address')
      }

      addToast({
        type: 'success',
        title: 'Address deleted',
        duration: 3000,
      })

      onChange()
      setConfirmDeleteId(null)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete address',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/customer/addresses/${id}/default`, { method: 'PATCH' })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to set default')
      }

      onChange()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to set default address',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const showForm = isAdding || editingId !== null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-sky-400" />
          Saved Addresses
        </CardTitle>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={startAdd} className="h-8 gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Label (e.g. Home, Office)</label>
                <Input
                  placeholder="Home"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="h-9"
                />
              </div>
              <div />
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Address Line 1 *</label>
                <Input
                  placeholder="Street address"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                  className={cn('h-9', formErrors.address_line1 && 'border-destructive')}
                />
                {formErrors.address_line1 && <p className="text-xs text-destructive">{formErrors.address_line1}</p>}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Address Line 2</label>
                <Input
                  placeholder="Apartment, suite, unit, etc. (optional)"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Postal Code *</label>
                <Input
                  placeholder="40000"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  className={cn('h-9', formErrors.postal_code && 'border-destructive')}
                />
                {formErrors.postal_code && <p className="text-xs text-destructive">{formErrors.postal_code}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">City *</label>
                <Input
                  placeholder="Shah Alam"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className={cn('h-9', formErrors.city && 'border-destructive')}
                />
                {formErrors.city && <p className="text-xs text-destructive">{formErrors.city}</p>}
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">State *</label>
                <select
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className={cn(
                    'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring appearance-none',
                    formErrors.state ? 'border-destructive' : ''
                  )}
                >
                  {MALAYSIAN_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
                {formErrors.state && <p className="text-xs text-destructive">{formErrors.state}</p>}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSubmit} disabled={isLoading} className="h-8">
                {isLoading ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelForm} disabled={isLoading} className="h-8">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {addresses.length === 0 && !showForm ? (
          <div className="text-center py-6">
            <MapPin className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved addresses yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add an address for faster checkout</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {addresses.map((address) => (
              <div
                key={address.id}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
              >
                {confirmDeleteId === address.id ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Delete this address?</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDelete(address.id)} disabled={isLoading}>
                        Delete
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{address.label || 'Address'}</span>
                        {address.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold">
                            <Star className="h-3 w-3 fill-gold" />
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!address.is_default && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-gold"
                            onClick={() => handleSetDefault(address.id)}
                            disabled={isLoading}
                            title="Set as default"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(address)}
                          disabled={isLoading || showForm}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteId(address.id)}
                          disabled={isLoading || showForm}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {address.address_line1}
                      {address.address_line2 && `, ${address.address_line2}`}
                    </p>
                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                      {address.postal_code}, {address.city}, {address.state}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
