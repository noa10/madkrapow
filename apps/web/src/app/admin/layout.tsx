"use client";

import { useState, useEffect } from "react";
import { Menu } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  Users,
  BarChart3,
  FileBarChart2,
  BadgePercent,
  Settings,
} from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client";
import { type StaffRole } from "@/lib/auth/roles";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: React.ElementType;
  roles: StaffRole[];
}

const allNavItems: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", icon: LayoutDashboard, roles: ["admin", "manager", "cashier", "kitchen"] },
  { key: "orders", label: "Orders", href: "/admin/orders", icon: ClipboardList, roles: ["admin", "manager", "cashier"] },
  { key: "kitchen", label: "Kitchen", href: "/admin/kitchen", icon: ChefHat, roles: ["admin", "manager", "kitchen"] },
  { key: "menu", label: "Menu", href: "/admin/menu", icon: UtensilsCrossed, roles: ["admin", "manager"] },
  { key: "employees", label: "Employees", href: "/admin/employees", icon: Users, roles: ["admin", "manager"] },
  { key: "analytics", label: "Analytics", href: "/admin/analytics", icon: BarChart3, roles: ["admin"] },
  { key: "reports", label: "Reports", href: "/admin/analytics/reports", icon: FileBarChart2, roles: ["admin", "manager"] },
  { key: "promos", label: "Promos", href: "/admin/promos", icon: BadgePercent, roles: ["admin", "manager"] },
  { key: "settings", label: "Settings", href: "/admin/settings", icon: Settings, roles: ["admin"] },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const supabase = getBrowserClient();

  useEffect(() => {
    const stored = localStorage.getItem("sidebar:admin");
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar:admin", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setHasAccess(false);
          return;
        }

        const role = (user.app_metadata?.role as string) || null;
        setUserRole(role);

        const staffRoles: StaffRole[] = ["admin", "manager", "cashier", "kitchen"];
        setHasAccess(staffRoles.includes(role as StaffRole));
      } catch (error) {
        console.error("Role check failed:", error);
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkRole();
  }, [supabase]);

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      window.location.href = "/";
    }
  }, [isLoading, hasAccess]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  const navItems = allNavItems.filter((item) =>
    item.roles.includes(userRole as StaffRole)
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/8 bg-black/60 backdrop-blur-xl px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </Button>
          <span className="text-sm font-semibold font-heading text-foreground">
            Mad Krapow Admin
          </span>
        </div>
      </header>

      {/* Sidebar */}
      <AdminSidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        navItems={navItems}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((prev) => !prev)}
      />

      {/* Main content */}
      <main className={cn("min-h-screen transition-all duration-300 ease-in-out", collapsed ? "lg:ml-[72px]" : "lg:ml-[260px]")}>
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
