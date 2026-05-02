"use client";

import { ClientPageShell } from "@/components/layout/ClientPageShell";

interface HomePageLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function HomePageLayout({ children, activeTab: _activeTab, onTabChange: _onTabChange }: HomePageLayoutProps) {
  return (
    <ClientPageShell activeHref="/">
      {children}
    </ClientPageShell>
  );
}
