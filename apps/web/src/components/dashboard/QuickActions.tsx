"use client"

import Link from "next/link"
import { ArrowUpRight, ShoppingBag, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

const quickActions = [
  {
    href: "/",
    label: "Browse Menu",
    description: "Explore our latest offerings",
    icon: BookOpen,
    gradient: "from-amber-500/10 to-orange-500/5",
    hoverBorder: "hover:border-amber-500/30",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
  },
  {
    href: "/orders",
    label: "Order History",
    description: "Track past orders",
    icon: ShoppingBag,
    gradient: "from-sky-500/10 to-cyan-500/5",
    hoverBorder: "hover:border-sky-500/30",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-400",
  },
]

export function QuickActions() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {quickActions.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-white/8 bg-card/50 p-5 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-card/80",
              action.hoverBorder
            )}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 transition-opacity group-hover:opacity-100`} />
            <div className="relative flex items-start gap-4">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", action.iconBg, action.iconColor)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{action.label}</h3>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:text-gold" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
