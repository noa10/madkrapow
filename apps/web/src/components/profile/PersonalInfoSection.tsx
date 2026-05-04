"use client"

import { useState, useCallback } from "react"
import { User, Mail, Phone, Pencil, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToastStore } from "@/stores/toast"

interface PersonalInfoSectionProps {
  customer: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
  } | null
  onUpdate: () => void
}

export function PersonalInfoSection({ customer, onUpdate }: PersonalInfoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState(customer?.name || "")
  const [phone, setPhone] = useState(customer?.phone || "")
  const addToast = useToastStore((s) => s.addToast)

  const handleSave = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/customer/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, phone: phone.trim() || null }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to update profile")
      }
      addToast({ type: "success", title: "Profile updated", duration: 3000 })
      setIsEditing(false)
      onUpdate()
    } catch (err) {
      addToast({
        type: "error",
        title: "Update failed",
        description: err instanceof Error ? err.message : "Something went wrong",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [name, phone, onUpdate, addToast])

  const handleCancel = () => {
    setName(customer?.name || "")
    setPhone(customer?.phone || "")
    setIsEditing(false)
  }

  return (
    <div className="rounded-xl border border-white/8 bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10">
            <User className="h-4 w-4 text-gold" />
          </div>
          <h3 className="text-sm font-semibold text-foreground font-heading tracking-wide">
            Personal Info
          </h3>
        </div>
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1 block">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="bg-background/50"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1 block">Phone</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Your phone number"
              className="bg-background/50"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isLoading}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {customer?.email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Email</div>
                <div className="text-sm text-foreground">{customer.email}</div>
              </div>
            </div>
          )}
          {customer?.name && (
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Name</div>
                <div className="text-sm text-foreground">{customer.name}</div>
              </div>
            </div>
          )}
          {customer?.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Phone</div>
                <div className="text-sm text-foreground">{customer.phone}</div>
              </div>
            </div>
          )}
          {!customer?.name && !customer?.phone && !customer?.email && (
            <p className="text-sm text-muted-foreground text-center py-4">No account details yet</p>
          )}
        </div>
      )}
    </div>
  )
}
