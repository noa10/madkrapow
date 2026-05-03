"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveSidebar } from "@/components/layout/ResponsiveSidebar"
import { SidebarHeader } from "@/components/layout/SidebarHeader"
import { Tooltip } from "@/components/ui/Tooltip"

interface NavItem {
  key: string
  href: string
  label: string
  icon: React.ElementType
}

interface AdminSidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
  navItems: NavItem[]
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function AdminSidebar({ mobileOpen, onMobileClose, navItems, collapsed = false, onToggleCollapsed }: AdminSidebarProps) {
  const pathname = usePathname()

  const desktopWidth = collapsed ? "w-[72px]" : "w-[260px]"

  return (
    <ResponsiveSidebar mobileOpen={mobileOpen} onMobileClose={onMobileClose} desktopWidth={desktopWidth}>
      <div className="flex h-full flex-col">
        <SidebarHeader
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed ?? (() => {})}
          logoHref="/admin"
          logoTooltip="Dashboard"
        />

        {/* Navigation */}
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href))
            const link = (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => onMobileClose()}
                aria-label={item.label}
                className={cn(
                  collapsed
                    ? "flex justify-center p-3 rounded-lg transition-all duration-200"
                    : "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-200",
                  isActive
                    ? "bg-gold/15 text-gold font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className={cn("transition-opacity", collapsed && "hidden")}>
                  {item.label}
                </span>
              </Link>
            )
            return collapsed ? (
              <Tooltip key={item.key} content={item.label}>
                {link}
              </Tooltip>
            ) : (
              link
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom section */}
        <div className="p-4 border-t border-white/8">
          {collapsed ? (
            <Tooltip content="Back to Store">
              <Link
                href="/"
                onClick={() => onMobileClose()}
                aria-label="Back to Store"
                className="flex justify-center p-3 rounded-lg text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <Store className="h-5 w-5 shrink-0" />
              </Link>
            </Tooltip>
          ) : (
            <Link
              href="/"
              onClick={() => onMobileClose()}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <Store className="h-3.5 w-3.5 shrink-0" />
              <span>Back to Store</span>
            </Link>
          )}
        </div>
      </div>
    </ResponsiveSidebar>
  )
}
