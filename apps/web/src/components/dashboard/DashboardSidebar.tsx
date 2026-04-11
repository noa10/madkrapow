"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Home, ShoppingBag, X, LogOut, Store } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

interface DashboardSidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

const sidebarNavItems = [
  { href: "/profile", label: "Dashboard", icon: Home },
  { href: "/orders", label: "Order History", icon: ShoppingBag },
]

export function DashboardSidebar({ mobileOpen, onMobileClose }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userInitial, setUserInitial] = useState<string>("?")
  const supabase = getBrowserClient()

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email ?? null)
        setUserInitial(user.email?.[0]?.toUpperCase() ?? "?")
      }
    }
    loadUser()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    onMobileClose()
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-5 py-6">
        <Link href="/" className="inline-block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-lg font-bold text-gold font-heading">
              MK
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground font-heading tracking-wide">
                Mad Krapow
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                Customer
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="space-y-1 px-3">
        {sidebarNavItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
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
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom section */}
      <div className="space-y-3 p-4 border-t border-white/8">
        {/* User info */}
        {userEmail && (
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-muted-foreground">
              {userInitial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-foreground">{userEmail}</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Link
            href="/"
            onClick={() => onMobileClose()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Store className="h-3.5 w-3.5" />
            Back to Store
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )

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
      <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[260px] flex-col bg-black/60 backdrop-blur-xl border-r border-white/8 lg:flex">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <aside className="fixed left-0 top-0 z-50 h-screen w-[260px] bg-surface-elevated border-r border-white/8 lg:hidden">
          <div className="absolute right-2 top-2">
            <button
              onClick={onMobileClose}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {sidebarContent}
        </aside>
      )}
    </>
  )
}
