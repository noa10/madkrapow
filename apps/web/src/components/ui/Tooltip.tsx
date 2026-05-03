"use client"

import { cn } from "@/lib/utils"

interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: "left" | "right" | "top" | "bottom"
}

export function Tooltip({ content, children, side = "right" }: TooltipProps) {
  const sideClasses = {
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
  }

  return (
    <div className="group relative flex items-center justify-center">
      {children}
      <div
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
          sideClasses[side]
        )}
        role="tooltip"
      >
        {content}
      </div>
    </div>
  )
}
