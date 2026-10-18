"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MenuItem } from "@/lib/queries/menu";

const MenuItemForm = dynamic(
  () => import("@/components/admin/MenuItemForm").then((mod) => mod.MenuItemForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6" aria-hidden="true">
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    ),
  }
);

interface MenuItemFormLoaderProps {
  menuItem?: MenuItem;
  isNew?: boolean;
}

/**
 * Client-only boundary for the (heavy) menu item create/edit form. The form's
 * chunk is fetched when the route renders instead of being bundled with the
 * route shell.
 */
export function MenuItemFormLoader({ menuItem, isNew = false }: MenuItemFormLoaderProps) {
  return <MenuItemForm menuItem={menuItem} isNew={isNew} />;
}
