"use client"

import { useState, useCallback, useRef } from "react"
import { User, Mail, Phone, Pencil, Check, X, Loader2, Camera } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToastStore } from "@/stores/toast"

interface PersonalInfoSectionProps {
  customer: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    avatarUrl: string | null
  } | null
  onUpdate: () => void
}

export function PersonalInfoSection({ customer, onUpdate }: PersonalInfoSectionProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(customer?.avatarUrl || '')
  const [name, setName] = useState(customer?.name || "")
  const [phone, setPhone] = useState(customer?.phone || "")
  const addToast = useToastStore((s) => s.addToast)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      addToast({ type: 'error', title: 'Invalid file type', description: 'Only JPEG, PNG, and WebP are allowed', duration: 4000 })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'error', title: 'File too large', description: 'Maximum size is 5MB', duration: 4000 })
      return
    }

    setAvatarUploading(true)
    try {
      const { getBrowserClient } = await import('@/lib/supabase/client')
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        addToast({ type: 'error', title: 'Not authenticated', duration: 4000 })
        return
      }

      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/customer/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to upload avatar')
      }

      setAvatarUrl(data.avatarUrl)
      onUpdate()
      addToast({ type: 'success', title: 'Photo updated', duration: 3000 })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Something went wrong',
        duration: 4000,
      })
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAvatarRemove = async () => {
    setAvatarUploading(true)
    try {
      const { getBrowserClient } = await import('@/lib/supabase/client')
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        addToast({ type: 'error', title: 'Not authenticated', duration: 4000 })
        return
      }

      const res = await fetch('/api/customer/avatar', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to remove photo')
      }

      setAvatarUrl('')
      onUpdate()
      addToast({ type: 'success', title: 'Photo removed', duration: 3000 })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to remove photo',
        duration: 4000,
      })
    } finally {
      setAvatarUploading(false)
    }
  }

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

      <div className="flex items-center gap-4 mb-4">
        <div className="relative group">
          {avatarUrl ? (
            <div className="relative h-14 w-14 rounded-full overflow-hidden">
              <Image
                src={avatarUrl}
                alt="Profile photo"
                fill
                sizes="56px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <User className="h-7 w-7 text-primary/60" />
            </div>
          )}
          {avatarUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
          {!avatarUploading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/30"
            >
              <Camera className="h-4 w-4 text-white" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          {avatarUrl ? (
            <Button variant="ghost" size="sm" onClick={handleAvatarRemove} disabled={avatarUploading} className="h-7 text-xs text-muted-foreground">
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading} className="h-7 text-xs text-muted-foreground">
              <Camera className="h-3 w-3 mr-1" />
              Add photo
            </Button>
          )}
        </div>
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
