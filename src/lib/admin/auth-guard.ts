"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

        // Check if user has admin role in metadata
        const userRole = user.user_metadata?.role;
        const isAdminUser = userRole === "admin";

        setIsAdmin(isAdminUser);
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      const userRole = user?.user_metadata?.role;
      const isAdminUser = userRole === "admin";
      setIsAdmin(isAdminUser);
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

