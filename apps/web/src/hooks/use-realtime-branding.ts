"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

export interface StoreBranding {
  logoUrl: string | null;
  heroImageUrl: string | null;
  storeName: string;
}

async function fetchBrandingData(): Promise<StoreBranding & { error: string | null }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("store_branding")
    .select("logo_url, hero_image_url, store_name")
    .limit(1)
    .single();

  if (error) {
    return { logoUrl: null, heroImageUrl: null, storeName: "Mad Krapow", error: error.message };
  }
  return {
    logoUrl: data?.logo_url as string | null,
    heroImageUrl: data?.hero_image_url as string | null,
    storeName: (data?.store_name as string) || "Mad Krapow",
    error: null,
  };
}

export function useRealtimeBranding(): StoreBranding & {
  loading: boolean;
  error: string | null;
} {
  const [branding, setBranding] = useState<StoreBranding>({
    logoUrl: null,
    heroImageUrl: null,
    storeName: "Mad Krapow",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchBrandingData().then((result) => {
      if (cancelled) return;
      setBranding({
        logoUrl: result.logoUrl,
        heroImageUrl: result.heroImageUrl,
        storeName: result.storeName,
      });
      setError(result.error);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`branding-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_branding",
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            fetchBrandingData().then((result) => {
              setBranding({
                logoUrl: result.logoUrl,
                heroImageUrl: result.heroImageUrl,
                storeName: result.storeName,
              });
              setError(result.error);
              setLoading(false);
            });
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  return { ...branding, loading, error };
}
