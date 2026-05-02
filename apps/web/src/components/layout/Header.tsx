"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdminUser, type RoleAwareUser } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { getBrowserClient } from "@/lib/supabase/client";
import { useCartStore } from "@/stores/cart";
import { ProfileDropdown } from "@/components/layout/ProfileDropdown";

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const items = useCartStore((state) => state.items);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<RoleAwareUser | null>(null);
  const supabase = getBrowserClient();

  const openDrawer = useCartStore((state) => state.openDrawer);

  const getNavHref = (link: string) => {
    if (link === "Menu") return "/";
    if (link === "About") return "/about";
    if (link === "Order") return "/order";
    return `/${link.toLowerCase()}`;
  };

  const isAdmin = isAdminUser(user);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Sign out failed:", error.message);
      return;
    }
    setUser(null);
    setIsMobileMenuOpen(false);
    window.location.href = "/";
  };

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const navLinks = ["Menu", "About", "Order"];

  const authLink = isAdmin ? (
    <Link
      href="/admin"
      className="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold sm:block"
    >
      Admin
    </Link>
  ) : user ? (
    <ProfileDropdown
      userEmail={user.email}
    />
  ) : (
    <Link
      href="/auth"
      className="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold sm:block"
    >
      Login
    </Link>
  );

  const mobileAuthLink = isAdmin ? (
    <Link
      href="/admin"
      className="rounded-full border border-white/10 px-4 py-2 text-left text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
      onClick={() => setIsMobileMenuOpen(false)}
    >
      Admin
    </Link>
  ) : user ? (
    <div className="flex flex-col gap-2">
      <Link
        href="/profile"
        className="rounded-full border border-white/10 px-4 py-2 text-left text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Dashboard
      </Link>
      <Link
        href="/orders"
        className="rounded-full border border-white/10 px-4 py-2 text-left text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
        onClick={() => setIsMobileMenuOpen(false)}
      >
        Order History
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        className="justify-start rounded-full border border-white/10 px-4 py-2 text-left text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
      >
        <LogOut className="mr-2 h-3.5 w-3.5" />
        Sign out
      </Button>
    </div>
  ) : (
    <Link
      href="/auth"
      className="rounded-full border border-white/10 px-4 py-2 text-left text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
      onClick={() => setIsMobileMenuOpen(false)}
    >
      Login
    </Link>
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-white/8 bg-black/45 backdrop-blur-xl transition-all duration-200",
        className
      )}
    >
      <div className="container mx-auto flex items-center justify-between gap-6 px-4 py-4">
        <Link href="/" className="flex-shrink-0">
          <Image
            src="/madkrapow-logo.png"
            alt="Mad Krapow"
            width={0}
            height={0}
            className="h-14 w-auto"
            sizes="224px"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link}
              href={getNavHref(link)}
              className="text-sm uppercase tracking-[0.28em] text-muted-foreground transition hover:text-gold"
            >
              {link}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {authLink}
          <button
            onClick={openDrawer}
            className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,rgba(210,176,123,0.24),rgba(210,176,123,0.08))] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.32em] text-gold transition hover:brightness-110"
          >
            Cart ·{' '}
            <span key={totalItems} className="inline-block animate-scale-in">
              {totalItems.toString().padStart(2, '0')}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-white/8 bg-black/60 lg:hidden">
          <nav className="container mx-auto flex flex-col gap-4 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link}
                href={getNavHref(link)}
                className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground transition hover:text-gold"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link}
              </Link>
            ))}
            {mobileAuthLink}
          </nav>
        </div>
      )}
    </header>
  );
}
