"use client"

import { cn } from "@/lib/utils"

interface AppLogoProps {
  className?: string
}

export function AppLogo({ className }: AppLogoProps) {
  return (
    <img
      src="/madkrapow-logo.webp"
      alt="Mad Krapow"
      width={128}
      height={128}
      className={cn("shrink-0 object-contain", className)}
    />
  )
}
