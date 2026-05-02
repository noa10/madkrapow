"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { hasAnyRole } from "@/lib/auth/roles";
import { getBrowserClient } from "@/lib/supabase/client";

export function useRoleGuard(allowedRoles: string[]) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = getBrowserClient();

  const rolesKey = useMemo(() => allowedRoles.join(","), [allowedRoles]);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setHasAccess(false);
          return;
        }

        setHasAccess(hasAnyRole(user, allowedRoles));
      } catch (error) {
        console.error("Role guard check failed:", error);
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkRole();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setHasAccess(hasAnyRole(session?.user, allowedRoles));
    });

    return () => {
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, rolesKey]);

  useEffect(() => {
    if (!isLoading && hasAccess === false) {
      router.push("/admin");
    }
  }, [isLoading, hasAccess, router]);

  return { hasAccess, isLoading };
}
