"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface ResponsiveSidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
  desktopWidth?: string
  mobileWidth?: string
  children: React.ReactNode
  mobileCloseButton?: boolean
  className?: string
  mobileClassName?: string
  desktopClassName?: string
}

export function ResponsiveSidebar({
  mobileOpen,
  onMobileClose,
  desktopWidth = "w-[260px]",
  mobileWidth = "w-[260px]",
  children,
  mobileCloseButton = true,
  className,
  mobileClassName,
  desktopClassName,
}: ResponsiveSidebarProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        onMobileClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [mobileOpen, onMobileClose])

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 hidden h-screen flex-col bg-black/60 backdrop-blur-xl border-r border-white/8 lg:flex",
          desktopWidth,
          className,
          desktopClassName
        )}
      >
        {children}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 h-screen bg-surface-elevated border-r border-white/8 lg:hidden",
            mobileWidth,
            className,
            mobileClassName
          )}
        >
          {mobileCloseButton && (
            <div className="absolute right-2 top-2">
              <button
                onClick={onMobileClose}
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          {children}
        </aside>
      )}
    </>
  )
}
