"use client";

import { useRouter } from "next/navigation";
import { HomePageLayout } from "@/components/layout/HomePageLayout";
import { HeroView } from "@/components/home/HeroView";
import { HowToOrderSection } from "@/components/home/HowToOrderSection";
import { HowItWorksSection } from "@/components/home/HowItWorksSection";
import { HalalCommitmentSection } from "@/components/home/HalalCommitmentSection";

export function PageSwitcher() {
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
