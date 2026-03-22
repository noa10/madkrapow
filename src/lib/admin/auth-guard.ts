"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { isAdminUser } from "@/lib/auth/roles";
import { getBrowserClient } from "@/lib/supabase/client";

export function useAdminGuard() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const supabase = getBrowserClient();

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(isAdminUser(user));
      } catch (error) {
        console.error("Admin check failed:", error);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAdmin();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setIsAdmin(isAdminUser(session?.user));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!isLoading && isAdmin === false) {
      router.push("/");
    }
  }, [isLoading, isAdmin, router]);

  return { isAdmin, isLoading };
}
