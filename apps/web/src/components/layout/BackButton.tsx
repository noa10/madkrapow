"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

interface BackButtonProps {
  label?: string
  fallbackHref?: string
  className?: string
}

export function BackButton({
  label = "Back to Menu",
  fallbackHref = "/menu",
  className = "mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors",
}: BackButtonProps) {
  const router = useRouter()

  const handleClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  return (
    <button onClick={handleClick} className={className}>
      <ArrowLeft className="h-4 w-4" />
      ← {label}
    </button>
  )
}
