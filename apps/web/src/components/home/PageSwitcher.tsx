"use client";

import { useRouter } from "next/navigation";
import { HomePageLayout } from "@/components/layout/HomePageLayout";
import { HeroView } from "@/components/home/HeroView";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";

interface PageSwitcherProps {
  categories: CategoryWithMenuItems[];
}

export function PageSwitcher({ categories: _categories }: PageSwitcherProps) {
  const router = useRouter();

  return (
    <HomePageLayout activeTab="hero" onTabChange={() => {}}>
      <HeroView onNavigateToMenu={() => router.push("/menu")} />
    </HomePageLayout>
  );
}
