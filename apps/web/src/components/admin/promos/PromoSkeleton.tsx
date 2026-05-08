"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export function PromoCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex gap-1.5 pt-0.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

export function PromoTableSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_80px_80px_60px_100px_100px_80px_120px] gap-4 px-4 py-3 border-b">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid grid-cols-[1fr_80px_80px_80px_60px_100px_100px_80px_120px] gap-4 px-4 py-3 border-b last:border-0 items-center"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <div className="flex justify-end gap-1">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
