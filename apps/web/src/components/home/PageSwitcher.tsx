"use client";

import { useState, useCallback, useEffect } from "react";
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
      {renderContent()}
    </HomePageLayout>
  );
}
