"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getBrowserClient } from "@/lib/supabase/client";

interface CartItem {
  id: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("cart");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      }
      return [...prev, item];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  };

  return (
    <CartContext.Provider
      value={{ items, totalItems, addItem, removeItem, updateQuantity }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const { totalItems } = useCart();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; user_metadata?: { role?: string } } | null>(null);
  const supabase = getBrowserClient();

  const isAdmin = user?.user_metadata?.role === "admin";

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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const navLinks = ["Menu", "Signature", "Experience", "Reserve"];

  const authLink = isAdmin ? (
    <Link
      href="/admin"
      className="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold sm:block"
    >
      Admin
    </Link>
  ) : user ? (
    <Link
      href="/profile"
      className="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold sm:block"
    >
      Profile
    </Link>
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
    <Link
      href="/profile"
      className="rounded-full border border-white/10 px-4 py-2 text-left text-xs uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-gold"
      onClick={() => setIsMobileMenuOpen(false)}
    >
      Profile
    </Link>
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
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-white/5 text-sm font-medium tracking-[0.35em] text-gold">
            MK
          </div>
          <div>
            <p className="font-display text-2xl leading-none text-white">Mad Krapow</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
              Bangkok supper club
            </p>
          </div>
        </div>

        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link}
              href={link === "Menu" ? "/menu" : "#"}
              className="text-sm uppercase tracking-[0.28em] text-muted-foreground transition hover:text-gold"
            >
              {link}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {authLink}
          <Link
            href="/cart"
            className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,rgba(210,176,123,0.24),rgba(210,176,123,0.08))] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.32em] text-gold transition hover:brightness-110"
          >
            Cart · {totalItems.toString().padStart(2, "0")}
          </Link>
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
                href={link === "Menu" ? "/menu" : "#"}
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
