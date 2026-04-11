"use client";

import { useState } from "react";
import { HomePageLayout } from "@/components/layout/HomePageLayout";
import { HeroView } from "@/components/home/HeroView";
import { MenuView } from "@/components/home/MenuView";
import { AboutView } from "@/components/home/AboutView";
import { OrderView } from "@/components/home/OrderView";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";

interface PageSwitcherProps {
  categories: CategoryWithMenuItems[];
}

export function PageSwitcher({ categories }: PageSwitcherProps) {
  const [activeTab, setActiveTab] = useState("hero");

  const renderContent = () => {
    switch (activeTab) {
      case "menu":
        return <MenuView categories={categories} />;
      case "about":
        return <AboutView />;
      case "order":
        return <OrderView />;
      default:
        return <HeroView onNavigateToMenu={() => setActiveTab("menu")} />;
    }
  };

  return (
    <HomePageLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </HomePageLayout>
  );
}
