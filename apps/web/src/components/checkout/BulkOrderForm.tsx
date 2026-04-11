'use client'

import { useState } from 'react'
import { Building2, Calendar, DollarSign, Phone, FileText, Loader2, Info, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useCartStore } from '@/stores/cart'

interface BulkOrderFormData {
  company_name: string
  requested_date: string
  requested_time: string
  budget: string
  invoice_name: string
  contact_phone: string
  special_notes: string
  dropoff_instructions: string
}

interface BulkOrderFormProps {
  onSubmit: (data: BulkOrderFormData) => Promise<void>
  isSubmitting: boolean
}

/** Returns YYYY-MM-DD for a date offset by `daysAhead` from today (local time) */
function getMinDate(daysAhead = 3): string {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function BulkOrderForm({ onSubmit, isSubmitting }: BulkOrderFormProps) {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const subtotal = getSubtotal()
  const minDate = getMinDate(3) // enforce 3 days ahead to comfortably clear 48h window

  const [formData, setFormData] = useState<BulkOrderFormData>({
    company_name: '',
    requested_date: '',
    requested_time: '',
    budget: '',
    invoice_name: '',
    contact_phone: '',
    special_notes: '',
    dropoff_instructions: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateField = (field: keyof BulkOrderFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.company_name.trim()) {
      newErrors.company_name = 'Company or event name is required'
    }
    if (!formData.requested_date) {
      newErrors.requested_date = 'Delivery date is required'
    } else if (formData.requested_date < minDate) {
      newErrors.requested_date = 'Minimum 48 hours advance notice required. Please select a date at least 3 days from today.'
    }
    if (!formData.requested_time) {
      newErrors.requested_time = 'Delivery time is required'
    }
    if (!formData.contact_phone.trim()) {
      newErrors.contact_phone = 'Contact phone is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    await onSubmit(formData)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Event Details</CardTitle>
          <CardDescription>Tell us about your event</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Company / Event Name *
            </label>
            <Input
              placeholder="e.g. Acme Corp Team Lunch"
              value={formData.company_name}
              onChange={(e) => updateField('company_name', e.target.value)}
              className={errors.company_name ? 'border-destructive' : ''}
            />
            {errors.company_name && (
              <p className="text-xs text-destructive">{errors.company_name}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Delivery Date *
              </label>
              <Input
                type="date"
                value={formData.requested_date}
                onChange={(e) => updateField('requested_date', e.target.value)}
                min={minDate}
                className={errors.requested_date ? 'border-destructive' : ''}
              />
              {errors.requested_date ? (
                <p className="text-xs text-destructive">{errors.requested_date}</p>
              ) : (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Minimum 48 hours advance notice required
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Delivery Time *</label>
              <Input
                type="time"
                value={formData.requested_time}
                onChange={(e) => updateField('requested_time', e.target.value)}
                className={errors.requested_time ? 'border-destructive' : ''}
              />
              {errors.requested_time && (
                <p className="text-xs text-destructive">{errors.requested_time}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact &amp; Billing</CardTitle>
          <CardDescription>Invoicing and coordination</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Contact Phone *
              </label>
              <Input
                type="tel"
                placeholder="+60 12-345 6789"
                value={formData.contact_phone}
                onChange={(e) => updateField('contact_phone', e.target.value)}
                className={errors.contact_phone ? 'border-destructive' : ''}
              />
              {errors.contact_phone && (
                <p className="text-xs text-destructive">{errors.contact_phone}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Budget (optional)
              </label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 1500"
                value={formData.budget}
                onChange={(e) => updateField('budget', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Invoice / Billing Name (optional)
            </label>
            <Input
              placeholder="For invoicing purposes"
              value={formData.invoice_name}
              onChange={(e) => updateField('invoice_name', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              Special Notes
            </label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Allergen / Utensil / Packaging Notes (e.g. 5 vegetarian meals, no peanuts)"
              value={formData.special_notes}
              onChange={(e) => updateField('special_notes', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Parking / Dropoff Instructions
            </label>
            <textarea
              className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Park at lobby, ask for reception on 3rd floor"
              value={formData.dropoff_instructions}
              onChange={(e) => updateField('dropoff_instructions', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            `Submit for Review (RM ${(subtotal / 100).toFixed(2)})`
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
          <Info className="h-3 w-3" />
          Our team will review your order and contact you within 24 hours.
        </p>
      </div>
    </div>
  )
}
