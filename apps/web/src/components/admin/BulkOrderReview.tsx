'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Building2, Calendar, DollarSign, Phone, FileText, Check, X, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

interface BulkOrderReviewProps {
  orderId: string
  approvalStatus: string
  orderStatus: string
  subtotalCents: number
  bulkCompanyName: string | null
  bulkRequestedDate: string | null
  bulkBudgetCents: number | null
  bulkInvoiceName: string | null
  bulkContactPhone: string | null
  bulkSpecialNotes: string | null
  bulkDropoffInstructions: string | null
  reviewNotes: string | null
  approvedTotalCents: number | null
  onStatusUpdate: (status: string, approvedTotal?: number, notes?: string) => void
}

export function BulkOrderReview({
  orderId,
  approvalStatus,
  orderStatus,
  subtotalCents,
  bulkCompanyName,
  bulkRequestedDate,
  bulkBudgetCents,
  bulkInvoiceName,
  bulkContactPhone,
  bulkSpecialNotes,
  bulkDropoffInstructions,
  reviewNotes,
  approvedTotalCents,
  onStatusUpdate,
}: BulkOrderReviewProps) {
  const [adjustedTotal, setAdjustedTotal] = useState(
    ((approvedTotalCents ?? subtotalCents) ?? 0).toString()
  )
  const [notes, setNotes] = useState(reviewNotes ?? '')
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [error, setError] = useState('')
  const [isLoadingLink, setIsLoadingLink] = useState(false)

  const saveCheckoutUrl = (url: unknown) => {
    try {
      if (typeof url === 'string' && new URL(url).protocol === 'https:') {
        setCheckoutUrl(url)
        return true
      }
    } catch {
      // Invalid URLs are handled as unavailable payment links.
    }
    return false
  }

  const handleGetPaymentLink = async () => {
    setError('')
    setIsLoadingLink(true)
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/approve`)
      const data = await response.json()
      if (!data.success) {
        setError(`${data.error || 'Unable to get the payment link.'} Refresh the order and try again; contact support if it remains unavailable.`)
      } else if (!saveCheckoutUrl(data.checkoutUrl)) {
        setError('The payment link is unavailable. Refresh the order and try again.')
      }
    } catch {
      setError('Unable to get the payment link. Check your connection and try again.')
    } finally {
      setIsLoadingLink(false)
    }
  }

  const handleApprove = async () => {
    setError('')
    setIsApproving(true)
    try {
      // adjustedTotal is already stored in cents; the input converts RM to cents.
      const cents = Number(adjustedTotal)
      if (!Number.isSafeInteger(cents) || cents <= 0) {
        setError('Enter an approved total greater than zero.')
        return
      }

      const body = JSON.stringify({
        action: 'approve',
        approved_total_cents: cents,
        review_notes: notes || null,
      })

      const response = await fetch(`/api/admin/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })

      const data = await response.json()

      if (!data.success) {
        setError(`${data.error || 'Unable to approve the order.'} Refresh the order before trying again.`)
        return
      }

      if (!saveCheckoutUrl(data.checkoutUrl)) {
        setError('The order was approved, but the payment link is unavailable. Use Get payment link to try again.')
      }
      onStatusUpdate('approved', cents, notes)
    } catch {
      setError('Unable to confirm approval. Refresh the order before trying again.')
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    setError('')
    setIsRejecting(true)
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          review_notes: notes || 'Order rejected',
        }),
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error || 'Unable to reject the order. Please try again.')
        return
      }

      onStatusUpdate('rejected', undefined, notes)
    } catch {
      setError('Unable to confirm rejection. Refresh the order before trying again.')
    } finally {
      setIsRejecting(false)
    }
  }

  const statusBadge = approvalStatus === 'pending_review'
    ? { color: 'bg-amber-500/20 text-amber-500', label: 'Pending Review' }
    : approvalStatus === 'approved'
    ? { color: 'bg-green-500/20 text-green-500', label: 'Approved' }
    : { color: 'bg-red-500/20 text-red-500', label: 'Rejected' }

  return (
    <Card className="rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:border-amber-500/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Bulk Order Review</CardTitle>
          <Badge className={statusBadge.color}>{statusBadge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bulk details */}
        <div className="grid gap-3 text-sm">
          {bulkCompanyName && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{bulkCompanyName}</span>
            </div>
          )}
          {bulkRequestedDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(bulkRequestedDate), "MMMM d, yyyy 'at' h:mm a")}</span>
            </div>
          )}
          {bulkBudgetCents && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>Budget: RM {(bulkBudgetCents / 100).toFixed(2)}</span>
            </div>
          )}
          {bulkInvoiceName && (
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Invoice: {bulkInvoiceName}</span>
            </div>
          )}
          {bulkContactPhone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${bulkContactPhone}`} className="text-primary">
                {bulkContactPhone}
              </a>
            </div>
          )}
          {bulkSpecialNotes && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Special Notes</p>
              <p className="text-sm bg-background rounded p-2">{bulkSpecialNotes}</p>
            </div>
          )}
          {bulkDropoffInstructions && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Dropoff Instructions</p>
              <p className="text-sm bg-background rounded p-2">{bulkDropoffInstructions}</p>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

        {approvalStatus === 'approved' && orderStatus === 'pending' && (
          <div className="space-y-2">
            {checkoutUrl ? (
              <>
                <label htmlFor="bulk-checkout-url" className="block text-sm font-medium">Payment link</label>
                <Input id="bulk-checkout-url" value={checkoutUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                <p className="text-xs text-muted-foreground">Copy this link to share it with the customer.</p>
              </>
            ) : (
              <Button onClick={handleGetPaymentLink} disabled={isLoadingLink}>
                {isLoadingLink ? 'Getting payment link…' : 'Get payment link'}
              </Button>
            )}
          </div>
        )}

        {approvalStatus === 'pending_review' && (
          <>
            {/* Adjusted total */}
            <div>
              <label className="text-sm font-medium block mb-2">
                Approved Total (RM)
              </label>
              <Input
                type="number"
                min="0"
                value={(parseInt(adjustedTotal) / 100).toFixed(2)}
                onChange={(e) => {
                  const dollars = parseFloat(e.target.value) || 0
                  setAdjustedTotal(Math.round(dollars * 100).toString())
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Customer-submitted subtotal: RM {(subtotalCents / 100).toFixed(2)}
              </p>
            </div>

            {/* Review notes */}
            <div>
              <label className="text-sm font-medium block mb-2">
                Review Notes (visible to customer)
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm bg-background min-h-[80px] resize-none"
                placeholder="e.g. Adjusted price for packaging. Delivery included."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleApprove}
                disabled={isApproving || isRejecting}
                className="flex-1 gap-2"
              >
                {isApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve & Get Payment Link
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={isApproving || isRejecting}
                className="gap-2"
              >
                {isRejecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Reject
              </Button>
            </div>
          </>
        )}

        {approvalStatus !== 'pending_review' && reviewNotes && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Review Notes</p>
            <p className="text-sm bg-background rounded p-2">{reviewNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
