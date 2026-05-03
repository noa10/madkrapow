"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { AppLogo } from "@/components/ui/AppLogo"
import { Tooltip } from "@/components/ui/Tooltip"

interface SidebarHeaderProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  logoHref?: string
  logoTooltip?: string
}

export function SidebarHeader({
  collapsed,
  onToggleCollapsed,
  logoHref = "/",
  logoTooltip = "Home",
}: SidebarHeaderProps) {
  if (!collapsed) {
    return (
      <div className="flex h-14 items-center justify-between px-3">
        <Tooltip content={logoTooltip} side="bottom">
          <Link
            href={logoHref}
            aria-label={`Go to ${logoTooltip}`}
            className="inline-flex items-center justify-center rounded p-1.5 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <AppLogo className="h-7 w-7" />
          </Link>
        </Tooltip>
        <Tooltip content="Collapse sidebar" side="bottom">
          <button
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            className="hidden lg:inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="flex h-14 items-center justify-center">
      <div className="lg:hidden">
        <AppLogo className="h-7 w-7" />
      </div>

      <div className="hidden lg:block">
        <Tooltip content="Expand sidebar" side="right">
          <button
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            className="group relative inline-flex h-10 w-10 items-center justify-center rounded text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <AppLogo className="absolute h-7 w-7 opacity-100 transition-opacity duration-150 group-hover:opacity-0" />
            <PanelLeftOpen className="absolute h-5 w-5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
