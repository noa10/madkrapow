"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, Menu, ShoppingBag, Store, User, X } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { isAdminUser } from "@/lib/auth/roles"
import { useClientUser } from "@/lib/auth/client-user"
import { useCartStore } from "@/stores/cart"
import { useIsClient } from "@/hooks/useIsClient"
import { useRealtimeBranding } from "@/hooks/use-realtime-branding"
import { ClientFooter } from "./ClientFooter"

interface ClientPageShellProps {
  children: React.ReactNode
}

export function ClientPageShell({ children }: ClientPageShellProps) {
  // Both totals come from the same store helpers the cart drawer uses, so
  // modifier deltas and discounts are included and the header cannot drift.
  const totalItems = useCartStore((state) => state.getTotalItems())
  const subtotalCents = useCartStore((state) =>
    Math.max(0, state.getSubtotal() - state.getDiscountTotal())
  )
  const isClient = useIsClient()
  // The cart is persisted in localStorage; render zero until hydration so the
  // server HTML and the first client render match.
  const displayTotalItems = isClient ? totalItems : 0
  const displaySubtotalCents = isClient ? subtotalCents : 0
  const openDrawer = useCartStore((state) => state.openDrawer)
  const user = useClientUser()
  const { logoUrl } = useRealtimeBranding()
  const supabase = getBrowserClient()
  const isAdmin = isAdminUser(user)
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    closeMobile()
    router.replace("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar — brand + account + cart only: the storefront is the single
          ordering surface, so there are no section nav links any more. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[var(--topbar-h)] w-full max-w-[1280px] items-center gap-3 px-4 sm:px-6 md:gap-3.5 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Mad Krapow — home">
            <Image
              src={logoUrl ?? "/madkrapow-logo.webp"}
              alt="Mad Krapow"
              width={128}
              height={128}
              className="h-12 w-auto shrink-0 object-contain md:h-14"
              sizes="112px"
              priority
            />
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {user ? (
              <Link
                href="/profile"
                aria-label="Profile"
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-surface-2 hover:text-foreground md:inline-flex"
              >
                {user.user_metadata?.avatar_url ? (
                  <Image
                    src={user.user_metadata.avatar_url as string}
                    alt=""
                    width={22}
                    height={22}
                    className="h-[22px] w-[22px] rounded-full object-cover"
                  />
                ) : (
                  <User className="h-[18px] w-[18px]" />
                )}
              </Link>
            ) : (
              <Link
                href="/auth"
                className="hidden rounded-full px-4 py-2.5 text-[13px] font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground md:inline-flex"
              >
                Login
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Admin panel"
                className="hidden h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-surface-2 hover:text-foreground md:inline-flex"
              >
                <Store className="h-[18px] w-[18px]" />
              </Link>
            )}

            <button
              type="button"
              onClick={openDrawer}
              className="inline-flex min-h-11 items-center gap-2.5 rounded-full bg-primary py-1.5 pl-3.5 pr-2 text-[13px] font-bold text-primary-foreground shadow-[0_10px_24px_-12px_var(--accent)] transition hover:bg-[var(--accent-hover)]"
              aria-label={`Cart, ${displayTotalItems} item${displayTotalItems === 1 ? "" : "s"}`}
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-black/30 px-1.5 text-[11px] font-extrabold tabular-nums">
                {displayTotalItems}
              </span>
              {displayTotalItems > 0 && (
                <span className="hidden tabular-nums lg:inline">RM {(displaySubtotalCents / 100).toFixed(2)}</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-surface-2 hover:text-foreground md:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile account sheet */}
        {mobileOpen && (
          <div className="border-t border-border bg-background/95 backdrop-blur-xl md:hidden">
            <nav className="mx-auto flex w-full max-w-[1280px] flex-col gap-1 px-4 py-3 sm:px-6" aria-label="Mobile">
              {user ? (
                <>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={closeMobile}
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                    >
                      <Store className="h-4 w-4" />
                      Admin panel
                    </Link>
                  )}
                  <Link
                    href="/orders"
                    onClick={closeMobile}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    My orders
                  </Link>
                  <Link
                    href="/profile"
                    onClick={closeMobile}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <User className="h-4 w-4" />
                    Profile
                  </Link>
                  <Link
                    href="/about"
                    onClick={closeMobile}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Store className="h-4 w-4" />
                    About
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-red-400"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth"
                    onClick={closeMobile}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <User className="h-4 w-4" />
                    Login / Sign up
                  </Link>
                  <Link
                    href="/about"
                    onClick={closeMobile}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Store className="h-4 w-4" />
                    About
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="w-full overflow-x-clip">{children}</main>

      <ClientFooter />
    </div>
  )
}
