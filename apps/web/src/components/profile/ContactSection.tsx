"use client"

import { useState, useCallback } from "react"
import { Contact, Plus, Pencil, Trash2, Star, Loader2, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToastStore } from "@/stores/toast"

interface CustomerContact {
  id: string
  name: string
  phone: string
  is_default: boolean
}

interface ContactSectionProps {
  customerId: string
  contacts: CustomerContact[]
  onUpdate: () => void
}

export function ContactSection({ customerId: _customerId, contacts, onUpdate }: ContactSectionProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({ name: '', phone: '' })

  const resetForm = useCallback(() => {
    setForm({ name: '', phone: '' })
  }, [])

  const startEdit = (contact: CustomerContact) => {
    setForm({ name: contact.name, phone: contact.phone })
    setEditingId(contact.id)
    setIsAdding(false)
  }

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      addToast({ type: "error", title: "Required fields missing", description: "Name and phone are required", duration: 3000 })
      return
    }

    setIsLoading(true)
    try {
      const url = editingId ? `/api/customer/contacts/${editingId}` : '/api/customer/contacts'
      const method = editingId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim() }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || `Failed to ${editingId ? 'update' : 'add'} contact`)
      }

      addToast({ type: "success", title: editingId ? "Contact updated" : "Contact added", duration: 3000 })
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
      const res = await fetch(`/api/customer/contacts/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to delete contact")
      }
      addToast({ type: "success", title: "Contact deleted", duration: 3000 })
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
      const res = await fetch(`/api/customer/contacts/${id}/default`, { method: 'PATCH' })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to set default")
      }
      addToast({ type: "success", title: "Default contact updated", duration: 3000 })
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

  const isEditing = isAdding || editingId !== null

  return (
    <div className="rounded-xl border border-white/8 bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <Contact className="h-4 w-4 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground font-heading tracking-wide">Saved Contacts</h3>
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
          <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Full Name *" className="bg-background/50" />
          <Input value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone Number *" className="bg-background/50" />
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

      {!contacts || contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No saved contacts yet</p>
      ) : (
        <div className="space-y-2.5">
          {contacts.map((contact) => (
            <div key={contact.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{contact.name}</span>
                  {contact.is_default && (
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">Default</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!contact.is_default && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSetDefault(contact.id)} disabled={isLoading}>
                      <Star className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(contact)} disabled={isLoading || isEditing}>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(contact.id)} disabled={isLoading || isEditing}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{contact.phone}</p>

              {deleteId === contact.id && (
                <div className="mt-2 flex items-center gap-2 pt-2 border-t border-white/5">
                  <span className="text-xs text-muted-foreground">Delete this contact?</span>
                  <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => handleDelete(contact.id)} disabled={isLoading}>
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
