"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { Menu } from "lucide-react"
import { useCartStore } from "@/stores/cart"
import { cn } from "@/lib/utils"
import { ClientSidebar } from "@/components/layout/ClientSidebar"

interface ClientPageShellProps {
  children: React.ReactNode
  activeHref?: string
}

export function ClientPageShell({ children, activeHref }: ClientPageShellProps) {
  const items = useCartStore((state) => state.items)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const openDrawer = useCartStore((state) => state.openDrawer)

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    const stored = localStorage.getItem("sidebar:client")
    return stored === "true"
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem("sidebar:client", String(collapsed))
  }, [collapsed])

  const toggleCollapsed = () => setCollapsed((prev) => !prev)

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* Mobile Header */}
        <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-white/8 bg-black/60 backdrop-blur-xl px-4 py-3 lg:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="rounded-lg p-2 text-foreground hover:bg-white/5"
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/">
              <Image
                src="/madkrapow-logo.png"
                alt="Mad Krapow"
                width={0}
                height={0}
                className="h-10 w-auto"
                sizes="160px"
                priority
              />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openDrawer}
              className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,rgba(210,176,123,0.24),rgba(210,176,123,0.08))] px-4 py-2 text-xs font-medium uppercase tracking-[0.32em] text-gold transition hover:brightness-110"
            >
              Cart ·{" "}
              <span className="inline-block animate-scale-in">
                {totalItems.toString().padStart(2, "0")}
              </span>
            </button>
          </div>
        </header>

        {/* Sidebar */}
        <ClientSidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onToggleCollapsed={toggleCollapsed}
          activeHref={activeHref}
        />

        {/* Main Content */}
        <main
          className={cn(
            "flex-1 transition-all duration-300 ease-in-out",
            "pt-16 lg:pt-0",
            collapsed ? "lg:ml-[72px]" : "lg:ml-[260px]"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
