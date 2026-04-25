"use client"

import { DollarSign } from "lucide-react"

interface AdminOrdersSalesSummaryProps {
  label: string
  totalCents: number
}

function formatPrice(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`
}

export function AdminOrdersSalesSummary({ label, totalCents }: AdminOrdersSalesSummaryProps) {
  return (
    <div className="rounded-xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/10">
          <DollarSign className="h-5 w-5 text-gold" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums">{formatPrice(totalCents)}</p>
        </div>
      </div>
    </div>
  )
}
