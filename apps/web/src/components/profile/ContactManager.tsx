"use client"

import { useState } from "react"
import { Contact, Plus, Star, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast"

interface CustomerContact {
  id: string
  name: string
  phone: string
  is_default: boolean
}

interface ContactManagerProps {
  customerId: string
  contacts: CustomerContact[]
  onChange: () => void
}

export function ContactManager({ customerId: _customerId, contacts, onChange }: ContactManagerProps) {
  const addToast = useToastStore((state) => state.addToast)
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [formData, setFormData] = useState({ name: '', phone: '' })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const resetForm = () => {
    setFormData({ name: '', phone: '' })
    setFormErrors({})
  }

  const startAdd = () => {
    resetForm()
    setIsAdding(true)
    setEditingId(null)
    setConfirmDeleteId(null)
  }

  const startEdit = (contact: CustomerContact) => {
    setFormData({ name: contact.name, phone: contact.phone })
    setEditingId(contact.id)
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
    if (!formData.name.trim()) errors.name = 'Name is required'
    if (!formData.phone.trim()) errors.phone = 'Phone number is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsLoading(true)

    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
      }

      const url = editingId
        ? `/api/customer/contacts/${editingId}`
        : '/api/customer/contacts'

      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to save contact')
      }

      addToast({
        type: 'success',
        title: editingId ? 'Contact updated' : 'Contact added',
        duration: 3000,
      })

      onChange()
      cancelForm()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save contact',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/customer/contacts/${id}`, { method: 'DELETE' })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete contact')
      }

      addToast({
        type: 'success',
        title: 'Contact deleted',
        duration: 3000,
      })

      onChange()
      setConfirmDeleteId(null)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to delete contact',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetDefault = async (id: string) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/customer/contacts/${id}/default`, { method: 'PATCH' })
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to set default')
      }

      onChange()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to set default contact',
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
          <Contact className="h-4 w-4 text-emerald-400" />
          Saved Contacts
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
                <label className="text-xs font-medium text-muted-foreground">Full Name *</label>
                <Input
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={cn('h-9', formErrors.name && 'border-destructive')}
                />
                {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Phone Number *</label>
                <Input
                  placeholder="0123456789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={cn('h-9', formErrors.phone && 'border-destructive')}
                />
                {formErrors.phone && <p className="text-xs text-destructive">{formErrors.phone}</p>}
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

        {contacts.length === 0 && !showForm ? (
          <div className="text-center py-6">
            <Contact className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No saved contacts yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Add a contact for faster checkout</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
              >
                {confirmDeleteId === contact.id ? (
                  <div className="flex items-center justify-between">
                    <p className="text-sm">Delete this contact?</p>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDelete(contact.id)} disabled={isLoading}>
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
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium">{contact.name}</span>
                        {contact.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold">
                            <Star className="h-3 w-3 fill-gold" />
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!contact.is_default && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-gold"
                            onClick={() => handleSetDefault(contact.id)}
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
                          onClick={() => startEdit(contact)}
                          disabled={isLoading || showForm}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDeleteId(contact.id)}
                          disabled={isLoading || showForm}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{contact.phone}</p>
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
