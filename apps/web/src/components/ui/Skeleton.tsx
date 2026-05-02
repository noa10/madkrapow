import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Skeleton = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("animate-pulse bg-muted rounded-md", className)}
    {...props}
  >
    {children}
  </div>
));
Skeleton.displayName = "Skeleton";

export { Skeleton };
