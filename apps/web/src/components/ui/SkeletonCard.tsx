import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

function MenuItemCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Skeleton className="aspect-square w-full rounded-lg" />
      <div className="flex flex-col gap-2 px-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-4 w-1/4 px-1" />
      <Skeleton className="mt-auto h-10 w-full rounded-md" />
    </div>
  );
}

function MenuItemCardSkeletonGrid({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
        className,
      )}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <MenuItemCardSkeleton key={i} />
      ))}
    </div>
  );
}

export { MenuItemCardSkeleton, MenuItemCardSkeletonGrid };
