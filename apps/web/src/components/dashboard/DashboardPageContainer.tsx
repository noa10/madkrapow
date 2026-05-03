import type { ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

interface DashboardPageContainerProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode
  collapsed?: boolean
}

export function DashboardPageContainer({ children, className, collapsed = false, ...props }: DashboardPageContainerProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-background",
        className
      )}
      {...props}
    >
      <main className={cn("transition-all duration-200", collapsed ? "lg:ml-[72px]" : "lg:ml-[260px]")}>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
