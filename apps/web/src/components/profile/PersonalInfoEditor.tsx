"use client"

import { useState } from "react"
import { User, Pencil, Mail, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToastStore } from "@/stores/toast"

interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

interface PersonalInfoEditorProps {
  customer: Customer | null
  onChange: () => void
}

export function PersonalInfoEditor({ customer, onChange }: PersonalInfoEditorProps) {
  const addToast = useToastStore((state) => state.addToast)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
  })

  const startEdit = () => {
    setFormData({
      name: customer?.name || '',
      phone: customer?.phone || '',
    })
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setIsEditing(false)
  }

  const handleSubmit = async () => {
    setIsLoading(true)

    try {
      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim() || null,
          phone: formData.phone.trim() || null,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to update profile')
      }

      addToast({
        type: 'success',
        title: 'Profile updated',
        duration: 3000,
      })

      onChange()
      setIsEditing(false)
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update profile',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <User className="h-4 w-4 text-gold" />
          Personal Info
        </CardTitle>
        {!isEditing && (
          <Button variant="ghost" size="sm" onClick={startEdit} className="h-8 gap-1">
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Full Name</label>
              <Input
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input
                placeholder="0123456789"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleSubmit} disabled={isLoading} className="h-8">
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={isLoading} className="h-8">
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
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Name</div>
                <div className="text-sm text-foreground">{customer?.name || 'Not set'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Phone</div>
                <div className="text-sm text-foreground">{customer?.phone || 'Not set'}</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
