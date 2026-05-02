"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ChefHat,
  ShoppingCart,
  UtensilsCrossed,
  BarChart3,
  Users,
  Tag,
  Settings,
  Store,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ResponsiveSidebar } from "@/components/layout/ResponsiveSidebar"

interface NavItem {
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
        {/* Logo */}
        <div className="px-5 py-6 flex items-center justify-between">
          <Link href="/admin" className="inline-block">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg font-bold text-gold font-heading">
                MK
              </div>
              <div className={cn("transition-opacity", collapsed && "hidden")}>
                <div className="text-sm font-semibold text-foreground font-heading tracking-wide">
                  Mad Krapow
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  Admin
                </div>
              </div>
            </div>
          </Link>
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className={cn(
                "hidden rounded-lg p-2 text-muted-foreground transition hover:text-foreground lg:block",
                collapsed && "mx-auto"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onMobileClose()}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  isActive
                    ? "bg-gold/15 text-gold font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn("transition-opacity", collapsed && "hidden")}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom section */}
        <div className="p-4 border-t border-white/8">
          <Link
            href="/"
            onClick={() => onMobileClose()}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
              collapsed && "justify-center"
            )}
          >
            <Store className="h-3.5 w-3.5 shrink-0" />
            <span className={cn(collapsed && "hidden")}>Back to Store</span>
          </Link>
        </div>
      </div>
    </ResponsiveSidebar>
  )
}
