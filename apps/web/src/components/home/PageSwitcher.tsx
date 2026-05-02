"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { HomePageLayout } from "@/components/layout/HomePageLayout";
import { HeroView } from "@/components/home/HeroView";
import { MenuView } from "@/components/home/MenuView";
import { AboutView } from "@/components/home/AboutView";
import { OrderView } from "@/components/home/OrderView";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";

interface PageSwitcherProps {
  categories: CategoryWithMenuItems[];
}

const VALID_TABS = new Set(["menu", "about", "order"]);

function readHashTab(): string {
  if (typeof window !== "undefined") {
    const hash = window.location.hash.slice(1);
    if (VALID_TABS.has(hash)) return hash;
  }
  return "hero";
}

const navTabs = [
  { id: "hero", label: "Home" },
  { id: "menu", label: "Menu" },
  { id: "about", label: "About" },
  { id: "order", label: "Order" },
];

export function PageSwitcher({ categories }: PageSwitcherProps) {
  const [activeTab, setActiveTab] = useState(readHashTab);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined" && tab !== "hero") {
      window.history.pushState(null, "", `/#${tab}`);
    }
  }, []);

  useEffect(() => {
    const onPop = () => setActiveTab(readHashTab());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case "menu":
        return <MenuView categories={categories} />;
      case "about":
        return <AboutView />;
      case "order":
        return <OrderView />;
      default:
        return <HeroView onNavigateToMenu={() => handleTabChange("menu")} />;
    }
  };

  return (
    <HomePageLayout activeTab={activeTab} onTabChange={handleTabChange}>
      {/* Horizontal tab bar */}
      <nav className="sticky top-16 z-30 border-b border-white/8 bg-black/60 backdrop-blur-xl lg:top-0">
        <div className="flex gap-1 overflow-x-auto px-4 py-2 scrollbar-hide">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium uppercase tracking-[0.2em] transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-white/10 text-gold"
                  : "text-muted-foreground hover:bg-white/5 hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      {renderContent()}
    </HomePageLayout>
  );
}
