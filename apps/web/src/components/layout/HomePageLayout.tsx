"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { isAdminUser, type RoleAwareUser } from "@/lib/auth/roles";
import { useCartStore } from "@/stores/cart";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface HomePageLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navTabs = [
  { id: "hero", label: "Home" },
  { id: "menu", label: "Menu" },
  { id: "about", label: "About" },
  { id: "order", label: "Order" },
];

export function HomePageLayout({ children, activeTab, onTabChange }: HomePageLayoutProps) {
  const items = useCartStore((state) => state.items);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const openDrawer = useCartStore((state) => state.openDrawer);
  const [user, setUser] = useState<RoleAwareUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const supabase = getBrowserClient();
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
      }
    );
    return () => { subscription.unsubscribe(); };
  }, [supabase]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out failed:", error.message);
      return;
    }
    setUser(null);
    setMobileMenuOpen(false);
    window.location.href = "/";
  };

  const authLink = user ? (
    <ProfileDropdown userEmail={user.email} isAdmin={isAdmin} />
  ) : (
    <Link href="/auth" className="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold sm:block">
      Login
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        {/* Left Sidebar - Fixed */}
        <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[280px] flex-col border-r border-white/8 bg-black/60 backdrop-blur-xl lg:flex">
          {/* Logo */}
          <div className="px-6 py-6">
            <Link href="/">
              <Image
                src="/madkrapow-logo.png"
                alt="Mad Krapow"
                width={0}
                height={0}
                className="h-12 w-auto"
                sizes="192px"
                priority
              />
            </Link>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex flex-col gap-1 px-4">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "rounded-lg px-4 py-3 text-left text-sm uppercase tracking-[0.2em] transition-all duration-200",
                  activeTab === tab.id
                    ? "bg-white/10 text-gold font-semibold"
                    : "text-muted-foreground hover:bg-white/5 hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottom Actions */}
          <div className="border-t border-white/8 px-4 py-4">
            <div className="flex flex-col gap-3">
              <button
                onClick={openDrawer}
                className="w-full rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,rgba(210,176,123,0.24),rgba(210,176,123,0.08))] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.32em] text-gold transition hover:brightness-110"
              >
                Cart · {totalItems.toString().padStart(2, "0")}
              </button>
              {authLink}
            </div>
          </div>
        </aside>

        {/* Mobile Header */}
        <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/8 bg-black/60 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between px-4 py-4">
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
            <div className="flex items-center gap-3">
              <button
                onClick={openDrawer}
                className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,rgba(210,176,123,0.24),rgba(210,176,123,0.08))] px-4 py-2 text-xs font-medium uppercase tracking-[0.32em] text-gold transition hover:brightness-110"
              >
                Cart · {totalItems.toString().padStart(2, "0")}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Nav */}
          {mobileMenuOpen && (
            <div className="border-t border-white/8 px-4 py-4">
              <nav className="flex flex-col gap-2">
                {navTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      onTabChange(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      "rounded-lg px-4 py-3 text-left text-sm uppercase tracking-[0.2em] transition-all",
                      activeTab === tab.id
                        ? "bg-white/10 text-gold font-semibold"
                        : "text-muted-foreground hover:bg-white/5"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
                <div className="mt-2 border-t border-white/8 pt-3">
                  {user ? (
                    <div className="flex flex-col gap-2">
                      <Link
                        href="/profile"
                        className="rounded-full border border-white/10 px-4 py-2 text-center text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                      <Link
                        href="/orders"
                        className="rounded-full border border-white/10 px-4 py-2 text-center text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Order History
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          className="rounded-full border border-white/10 px-4 py-2 text-center text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Admin Panel
                        </Link>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSignOut}
                        className="justify-center rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
                      >
                        <LogOut className="mr-2 h-3.5 w-3.5" />
                        Sign out
                      </Button>
                    </div>
                  ) : (
                    <Link
                      href="/auth"
                      className="block rounded-full border border-white/10 px-4 py-2 text-center text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Login
                    </Link>
                  )}
                </div>
              </nav>
            </div>
          )}
        </header>

        {/* Right Content - Scrollable */}
        <main className="flex-1 lg:ml-[280px]">
          <div className="pt-16 lg:pt-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
