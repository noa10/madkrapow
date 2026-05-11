"use client";

import { useRouter } from "next/navigation";
import { HomePageLayout } from "@/components/layout/HomePageLayout";
import { HeroView } from "@/components/home/HeroView";
import { HowToOrderSection } from "@/components/home/HowToOrderSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { HalalCommitmentSection } from "@/components/home/HalalCommitmentSection";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";

interface PageSwitcherProps {
  categories: CategoryWithMenuItems[];
}

export function PageSwitcher({ categories: _categories }: PageSwitcherProps) {
  const router = useRouter();

  return (
    <HomePageLayout activeTab="hero" onTabChange={() => {}}>
      <HeroView onNavigateToMenu={() => router.push("/menu")} />
      <HowToOrderSection />
      <HowItWorksSection />
      <HalalCommitmentSection />
    </HomePageLayout>
  );
}
