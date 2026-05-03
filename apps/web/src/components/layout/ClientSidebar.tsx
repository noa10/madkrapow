"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  UtensilsCrossed,
  Info,
  ShoppingBag,
  Store,
  LogOut,
} from "lucide-react"
import { useState, useEffect } from "react"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { getBrowserClient } from "@/lib/supabase/client"
import { isAdminUser, type RoleAwareUser } from "@/lib/auth/roles"
import { useCartStore } from "@/stores/cart"
import { cn } from "@/lib/utils"
import { ResponsiveSidebar } from "@/components/layout/ResponsiveSidebar"
import { SidebarHeader } from "@/components/layout/SidebarHeader"

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/menu#categories", label: "Menu", icon: UtensilsCrossed },
  { href: "/about", label: "About", icon: Info },
  { href: "/order", label: "Order", icon: ShoppingBag },
]

interface ClientSidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onMobileClose: () => void
  onToggleCollapsed: () => void
  activeHref?: string
}

export function ClientSidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
  onToggleCollapsed,
  activeHref,
}: ClientSidebarProps) {
  const items = useCartStore((state) => state.items)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const openDrawer = useCartStore((state) => state.openDrawer)

  const [user, setUser] = useState<RoleAwareUser | null>(null)
  const supabase = getBrowserClient()
  const isAdmin = isAdminUser(user)
  const pathname = usePathname()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
      }
    )
    return () => { subscription.unsubscribe() }
  }, [supabase])

  const isActive = (href: string) => {
    if (activeHref) return activeHref === href
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href.split("#")[0])
  }

  const desktopWidth = collapsed ? "w-[72px]" : "w-[260px]"

  return (
    <ResponsiveSidebar
      mobileOpen={mobileOpen}
      onMobileClose={onMobileClose}
      desktopWidth={desktopWidth}
      mobileWidth="w-[260px]"
    >
      <div className="flex h-full flex-col">
        <SidebarHeader
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          logoHref="/"
          logoTooltip="Home"
        />

        {/* Navigation */}
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  active
                    ? "bg-white/10 text-gold font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn("transition-opacity", collapsed && "lg:hidden")}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom section */}
        <div className="space-y-3 p-4 border-t border-white/8">
          <button
            onClick={openDrawer}
            className={cn(
              "w-full rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,rgba(210,176,123,0.24),rgba(210,176,123,0.08))] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.32em] text-gold transition hover:brightness-110",
              collapsed && "px-2"
            )}
          >
            {collapsed ? (
              <span className="inline-block animate-scale-in">
                {totalItems.toString().padStart(2, "0")}
              </span>
            ) : (
              <>
                Cart ·{" "}
                <span className="inline-block animate-scale-in">
                  {totalItems.toString().padStart(2, "0")}
                </span>
              </>
            )}
          </button>

          {user ? (
            <div className={cn("flex flex-col gap-2", collapsed && "items-center")}>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={onMobileClose}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  <span className={cn(collapsed && "lg:hidden")}>Admin Panel</span>
                </Link>
              )}
              <Link
                href="/profile"
                onClick={onMobileClose}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <Home className="h-3.5 w-3.5 shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>Dashboard</span>
              </Link>
              <Link
                href="/orders"
                onClick={onMobileClose}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
              >
                <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>Order History</span>
              </Link>
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  setUser(null)
                  onMobileClose()
                  window.location.href = "/"
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-red-400 w-full text-left"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>Sign Out</span>
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              onClick={onMobileClose}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
                collapsed && "justify-center"
              )}
            >
              <span className={cn(collapsed && "lg:hidden")}>Login</span>
            </Link>
          )}
        </div>
      </div>
    </ResponsiveSidebar>
  )
}
