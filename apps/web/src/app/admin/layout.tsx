"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { type StaffRole } from "@/lib/auth/roles";
import {
  LayoutDashboard,
  ShoppingCart,
  Utensils,
  BarChart3,
  Settings,
  LogOut,
  FileText,
  ChefHat,
  Users,
  Ticket,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: StaffRole[];
}

const allNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "cashier", "kitchen"] },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, roles: ["admin", "manager", "cashier"] },
  { href: "/admin/kitchen", label: "Kitchen", icon: ChefHat, roles: ["admin", "manager", "kitchen"] },
  { href: "/admin/menu", label: "Menu", icon: Utensils, roles: ["admin", "manager"] },
  { href: "/admin/employees", label: "Employees", icon: Users, roles: ["admin", "manager"] },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, roles: ["admin"] },
  { href: "/admin/analytics/reports", label: "Reports", icon: FileText, roles: ["admin", "manager"] },
  { href: "/admin/promos", label: "Promos", icon: Ticket, roles: ["admin", "manager"] },
  { href: "/admin/settings", label: "Settings", icon: Settings, roles: ["admin"] },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const pathname = usePathname();
  const supabase = getBrowserClient();

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

        // Any staff role gets access to /admin layout (page guards handle finer control)
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
      <div className="flex items-center justify-center min-h-screen">
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
    <div className="flex min-h-screen bg-background">
      {/* Sticky Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex-shrink-0 sticky top-0 h-screen flex flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-xl font-bold text-primary font-heading">Admin Panel</h1>
        </div>
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
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
        <div className="p-4 border-t border-border">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-lg"
          >
            <LogOut className="h-5 w-5" />
            <span>Back to Store</span>
          </Link>
        </div>
      </aside>

      {/* Scrollable Main Content */}
      <main className="flex-1 p-6 overflow-y-auto max-h-screen text-foreground">{children}</main>
    </div>
  );
}
