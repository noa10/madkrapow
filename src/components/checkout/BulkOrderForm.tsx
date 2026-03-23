'use client'

import { useState } from 'react'
import { Building2, Users, Calendar, DollarSign, Phone, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCartStore } from '@/stores/cart'

interface BulkOrderFormData {
  company_name: string
  headcount: string
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

export function BulkOrderForm({ onSubmit, isSubmitting }: BulkOrderFormProps) {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const subtotal = getSubtotal()

  const [formData, setFormData] = useState<BulkOrderFormData>({
    company_name: '',
    headcount: '',
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
    if (!formData.headcount || parseInt(formData.headcount) < 1) {
      newErrors.headcount = 'Headcount must be at least 1'
    }
    if (!formData.requested_date) {
      newErrors.requested_date = 'Delivery date is required'
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
    <div className="space-y-5">
      {/* Company / Event Name */}
      <div>
        <label className="text-sm font-medium flex items-center gap-2 mb-2">
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
          <p className="text-xs text-destructive mt-1">{errors.company_name}</p>
        )}
      </div>

      {/* Headcount */}
      <div>
        <label className="text-sm font-medium flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Headcount / Pax *
        </label>
        <Input
          type="number"
          min="1"
          placeholder="Number of people"
          value={formData.headcount}
          onChange={(e) => updateField('headcount', e.target.value)}
          className={errors.headcount ? 'border-destructive' : ''}
        />
        {errors.headcount && (
          <p className="text-xs text-destructive mt-1">{errors.headcount}</p>
        )}
      </div>

      {/* Requested Date + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Delivery Date *
          </label>
          <Input
            type="date"
            value={formData.requested_date}
            onChange={(e) => updateField('requested_date', e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className={errors.requested_date ? 'border-destructive' : ''}
          />
          {errors.requested_date && (
            <p className="text-xs text-destructive mt-1">{errors.requested_date}</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium flex items-center gap-2 mb-2">
            Delivery Time *
          </label>
          <Input
            type="time"
            value={formData.requested_time}
            onChange={(e) => updateField('requested_time', e.target.value)}
            className={errors.requested_time ? 'border-destructive' : ''}
          />
          {errors.requested_time && (
            <p className="text-xs text-destructive mt-1">{errors.requested_time}</p>
          )}
        </div>
      </div>

      {/* Budget */}
      <div>
        <label className="text-sm font-medium flex items-center gap-2 mb-2">
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

      {/* Invoice Name */}
      <div>
        <label className="text-sm font-medium flex items-center gap-2 mb-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Invoice / Billing Name (optional)
        </label>
        <Input
          placeholder="For invoicing purposes"
          value={formData.invoice_name}
          onChange={(e) => updateField('invoice_name', e.target.value)}
        />
      </div>

      {/* Contact Phone */}
      <div>
        <label className="text-sm font-medium flex items-center gap-2 mb-2">
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
          <p className="text-xs text-destructive mt-1">{errors.contact_phone}</p>
        )}
      </div>

      {/* Special Notes */}
      <div>
        <label className="text-sm font-medium block mb-2">
          Allergen / Utensil / Packaging Notes
        </label>
        <textarea
          className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-none"
          placeholder="e.g. 5 vegetarian meals, no peanuts, provide disposable utensils"
          value={formData.special_notes}
          onChange={(e) => updateField('special_notes', e.target.value)}
        />
      </div>

      {/* Dropoff Instructions */}
      <div>
        <label className="text-sm font-medium block mb-2">
          Parking / Dropoff Instructions
        </label>
        <textarea
          className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-none"
          placeholder="e.g. Park at lobby, ask for reception on 3rd floor"
          value={formData.dropoff_instructions}
          onChange={(e) => updateField('dropoff_instructions', e.target.value)}
        />
      </div>

      {/* Submit */}
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

      <p className="text-xs text-muted-foreground text-center">
        Your bulk order will be reviewed by our team. We&apos;ll notify you within 24 hours.
      </p>
    </div>
  )
}
