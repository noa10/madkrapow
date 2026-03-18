"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminGuard } from "@/lib/admin/auth-guard";
  import {
    LayoutDashboard,
    ShoppingCart,
    Utensils,
    BarChart3,
    Settings,
    LogOut,
    FileText,
    ChefHat,
  } from "lucide-react";

  export default function AdminLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const { isAdmin, isLoading } = useAdminGuard();
    const pathname = usePathname();

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }

    if (!isAdmin) {
      return null; // Will be redirected by useAdminGuard
    }

    const navItems = [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { href: "/admin/kitchen", label: "Kitchen", icon: ChefHat },
      { href: "/admin/menu", label: "Menu", icon: Utensils },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/admin/analytics/reports", label: "Reports", icon: FileText },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex-shrink-0 relative">
        <div className="p-4 border-b border-border">
          <h1 className="text-xl font-bold text-primary font-heading">Admin Panel</h1>
        </div>
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 p-4 border-t border-border w-64">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg"
          >
            <LogOut className="h-5 w-5" />
            <span>Back to Store</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto text-foreground">{children}</main>
    </div>
  );
}