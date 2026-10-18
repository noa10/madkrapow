"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hasAnyRole } from "@/lib/auth/roles";
import {
  getAdminAuth,
  getCachedAdminAuth,
  subscribeAdminAuth,
  type AdminAuthSnapshot,
} from "@/lib/admin/role-cache";

const DENIED_SNAPSHOT: AdminAuthSnapshot = { user: null, role: null };

export function useRoleGuard(allowedRoles: string[]) {
  // Seed from the shared cache so an admin navigation inside the TTL resolves
  // synchronously (no spinner, no repeat getUser round-trip).
  const [auth, setAuth] = useState<AdminAuthSnapshot | null>(() => getCachedAdminAuth());
  const router = useRouter();

  const rolesKey = useMemo(() => allowedRoles.join(","), [allowedRoles]);

  useEffect(() => {
    let cancelled = false;

    const apply = (snapshot: AdminAuthSnapshot) => {
      if (!cancelled) setAuth(snapshot);
    };

    const cached = getCachedAdminAuth();
    if (cached) apply(cached);

    getAdminAuth()
      .then(apply)
      .catch((error) => {
        console.error("Role guard check failed:", error);
        apply(DENIED_SNAPSHOT);
      });

    // Auth changes update the shared snapshot and every mounted guard.
    const unsubscribe = subscribeAdminAuth(apply);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [rolesKey]);

  const hasAccess = auth === null ? null : hasAnyRole(auth.user, allowedRoles);
  const isLoading = auth === null;

  useEffect(() => {
    if (!isLoading && hasAccess === false) {
      router.push("/admin");
    }
  }, [isLoading, hasAccess, router]);

  return { hasAccess, isLoading };
}
