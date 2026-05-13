"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Home, ShoppingBag, LogOut, Store } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { ResponsiveSidebar } from "@/components/layout/ResponsiveSidebar"
import { SidebarHeader } from "@/components/layout/SidebarHeader"
import { Tooltip } from "@/components/ui/Tooltip"

interface DashboardSidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

const sidebarNavItems = [
  { href: "/profile", label: "Profile", icon: Home },
  { href: "/orders", label: "Food Orders", icon: ShoppingBag },
]

export function DashboardSidebar({ mobileOpen, onMobileClose, collapsed = false, onToggleCollapsed }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userInitial, setUserInitial] = useState<string>("?")
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)
  const supabase = getBrowserClient()

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserEmail(user.email ?? null)
        setUserInitial(user.email?.[0]?.toUpperCase() ?? "?")
        setUserAvatarUrl(user.user_metadata?.avatar_url ?? null)
      }
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
    onMobileClose()
  }

  const desktopWidth = collapsed ? "w-[72px]" : "w-[260px]"

  return (
    <ResponsiveSidebar mobileOpen={mobileOpen} onMobileClose={onMobileClose} desktopWidth={desktopWidth}>
      <div className="flex h-full flex-col">
        <SidebarHeader
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed ?? (() => {})}
          logoHref="/"
          logoTooltip="Home"
        />

        <nav className="space-y-1 px-3">
          {sidebarNavItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onMobileClose()}
                className={cn(
                  collapsed
                    ? "flex justify-center p-3 rounded-lg transition-all duration-200"
                    : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                  isActive
                    ? "bg-gold/15 text-gold font-medium"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn("transition-opacity", collapsed && "lg:hidden")}>
                  {item.label}
                </span>
              </Link>
            )
            return collapsed ? (
              <Tooltip key={item.href} content={item.label}>
                {link}
              </Tooltip>
            ) : (
              link
            )
          })}
        </nav>

        <div className="flex-1" />

        <div className="space-y-3 p-4 border-t border-white/8">
          {userEmail && !collapsed && (
            <div className="flex items-center gap-3 px-2 py-1">
              {userAvatarUrl ? (
                <div className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden">
                  <Image
                    src={userAvatarUrl}
                    alt="Profile"
                    fill
                    sizes="32px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-muted-foreground">
                  {userInitial}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-xs text-foreground">{userEmail}</div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {collapsed ? (
              <Tooltip content="Back to Store">
                <Link
                  href="/"
                  onClick={() => onMobileClose()}
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
                <Store className="h-3.5 w-3.5" />
                Back to Store
              </Link>
            )}
            {collapsed ? (
              <Tooltip content="Sign Out">
                <button
                  onClick={handleSignOut}
                  className="flex justify-center p-3 rounded-lg text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-red-400"
                >
                  <LogOut className="h-5 w-5 shrink-0" />
                </button>
              </Tooltip>
            ) : (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-red-400"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>
    </ResponsiveSidebar>
  )
}
