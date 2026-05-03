"use client"

import { cn } from "@/lib/utils"

interface AppLogoProps {
  className?: string
}

export function AppLogo({ className }: AppLogoProps) {
  return (
    <img
      src="/madkrapow-logo.svg"
      alt="Mad Krapow"
      className={cn("shrink-0 object-contain", className)}
    />
  )
}
