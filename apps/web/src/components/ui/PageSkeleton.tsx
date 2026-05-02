import { Skeleton } from "@/components/ui/Skeleton";
import { MenuItemCardSkeletonGrid } from "@/components/ui/SkeletonCard";

function MenuPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-[60vh] w-full rounded-lg" />
      <div className="flex gap-3 overflow-x-auto">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <MenuItemCardSkeletonGrid />
    </div>
  );
}

function ItemDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="aspect-video max-h-[500px] w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-6 w-1/4" />
      <Skeleton className="h-12 w-full rounded-md" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-1/3" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-24 rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 rounded-lg bg-card p-4"
          >
            <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/4" />
              <div className="mt-auto flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 self-center" />
          </div>
        ))}
      </div>
      <div className="w-full lg:w-80">
        <div className="flex flex-col gap-3 rounded-lg bg-card p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <div className="my-2 h-px bg-muted" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="mt-2 h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex flex-1 flex-col gap-6">
        <div className="flex items-center gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-20" />
              {i < 2 && <Skeleton className="h-px w-8" />}
            </div>
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg bg-card p-5">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-1/2 rounded-md" />
          </div>
        ))}
      </div>
      <div className="w-full lg:w-80">
        <div className="flex flex-col gap-3 rounded-lg bg-card p-5">
          <Skeleton className="h-5 w-1/3" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
          <div className="my-2 h-px bg-muted" />
          <div className="flex justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="mt-2 h-12 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

function OrderSuccessSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-20">
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-12 w-40 rounded-md" />
    </div>
  );
}

export {
  MenuPageSkeleton,
  ItemDetailSkeleton,
  CartSkeleton,
  CheckoutSkeleton,
  OrderSuccessSkeleton,
};
