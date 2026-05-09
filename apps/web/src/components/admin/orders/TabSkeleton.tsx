"use client"

import { Skeleton } from "@/components/ui/Skeleton"

function OrderRowSkeleton() {
  return (
    <div
      className="grid items-stretch w-full animate-pulse rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm min-h-[44px] grid-cols-[56px_2px_1fr_auto] md:grid-cols-[72px_2px_1fr_auto]"
    >
      {/* Col 1: time placeholder */}
      <div className="flex items-center justify-end px-1 md:px-2 py-3">
        <Skeleton className="h-3 w-6 md:w-10" />
      </div>

      {/* Col 2: gold bar placeholder */}
      <div className="row-span-3 flex flex-col items-center py-3">
        <div className="w-0.5 flex-1 rounded-full bg-gradient-to-b from-gold/20 via-gold/10 to-transparent" />
        <div className="w-0.5 flex-1 rounded-full bg-gradient-to-b from-transparent via-gold/5 to-gold/20" />
      </div>

      {/* Row 1: order number + status + items */}
      <div className="col-start-3 flex items-center gap-2 min-w-0 py-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-14 rounded-full" />
        <Skeleton className="h-3 w-10" />
      </div>

      {/* Row 1: total */}
      <div className="col-start-4 flex items-center justify-end py-3 pr-3">
        <Skeleton className="h-4 w-14" />
      </div>

      {/* Row 2: customer + badges */}
      <div className="col-start-3 flex items-center gap-2 min-w-0">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>

      {/* Row 2: secondary time */}
      <div className="col-start-4 flex items-center justify-end pr-3">
        <Skeleton className="h-3 w-20" />
      </div>

      {/* Row 3: actions */}
      <div className="col-start-3 col-span-2 pb-3 pr-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      </div>
    </div>
  )
}

export function TabSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <OrderRowSkeleton key={i} />
      ))}
    </div>
  )
}
