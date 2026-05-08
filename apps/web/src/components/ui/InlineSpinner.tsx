import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface InlineSpinnerProps {
  className?: string
  size?: "sm" | "md"
}

export function InlineSpinner({ className, size = "sm" }: InlineSpinnerProps) {
  return (
    <Loader2
      className={cn(
        "animate-spin shrink-0",
        size === "sm" ? "h-3 w-3" : "h-4 w-4",
        className
      )}
    />
  )
}
