"use client"

import { useState } from "react"
import { Lock, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useToastStore } from "@/stores/toast"

interface PasswordChangeFormProps {
  onSuccess?: () => void
}

export function PasswordChangeForm({ onSuccess }: PasswordChangeFormProps) {
  const addToast = useToastStore((state) => state.addToast)
  const [isLoading, setIsLoading] = useState(false)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const getPasswordStrength = (password: string): { label: string; color: string } => {
    if (password.length < 8) return { label: 'Too short', color: 'text-destructive' }
    let score = 0
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++

    switch (score) {
      case 0: return { label: 'Weak', color: 'text-red-400' }
      case 1: return { label: 'Fair', color: 'text-amber-400' }
      case 2: return { label: 'Good', color: 'text-yellow-400' }
      case 3: return { label: 'Strong', color: 'text-emerald-400' }
      case 4: return { label: 'Very Strong', color: 'text-green-400' }
      default: return { label: 'Weak', color: 'text-red-400' }
    }
  }

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!formData.currentPassword) errors.currentPassword = 'Current password is required'
    if (!formData.newPassword) errors.newPassword = 'New password is required'
    else if (formData.newPassword.length < 8) errors.newPassword = 'Password must be at least 8 characters'
    if (formData.newPassword !== formData.confirmPassword) errors.confirmPassword = 'Passwords do not match'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsLoading(true)

    try {
      const res = await fetch('/api/customer/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to change password')
      }

      addToast({
        type: 'success',
        title: 'Password changed',
        description: 'Your password has been updated successfully.',
        duration: 4000,
      })

      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      onSuccess?.()
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to change password',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const strength = getPasswordStrength(formData.newPassword)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Lock className="h-4 w-4 text-rose-400" />
          Change Password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Current Password</label>
          <div className="relative">
            <Input
              type={showCurrent ? 'text' : 'password'}
              placeholder="Enter current password"
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              className={cn('h-9 pr-10', formErrors.currentPassword && 'border-destructive')}
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {formErrors.currentPassword && <p className="text-xs text-destructive">{formErrors.currentPassword}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">New Password</label>
          <div className="relative">
            <Input
              type={showNew ? 'text' : 'password'}
              placeholder="Min 8 characters"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              className={cn('h-9 pr-10', formErrors.newPassword && 'border-destructive')}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {formData.newPassword && (
            <p className={cn('text-xs', strength.color)}>{strength.label}</p>
          )}
          {formErrors.newPassword && <p className="text-xs text-destructive">{formErrors.newPassword}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
          <div className="relative">
            <Input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter new password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className={cn('h-9 pr-10', formErrors.confirmPassword && 'border-destructive')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {formErrors.confirmPassword && <p className="text-xs text-destructive">{formErrors.confirmPassword}</p>}
        </div>

        <Button size="sm" onClick={handleSubmit} disabled={isLoading} className="h-8 mt-1">
          {isLoading ? 'Updating...' : 'Change Password'}
        </Button>
      </CardContent>
    </Card>
  )
}
