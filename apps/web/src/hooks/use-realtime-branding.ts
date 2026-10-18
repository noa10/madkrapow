"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";

export interface StoreBranding {
  logoUrl: string | null;
  heroImageUrl: string | null;
  storeName: string;
}

interface BrandingState extends StoreBranding {
  loading: boolean;
  error: string | null;
}

const BRANDING_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_STATE: BrandingState = {
  logoUrl: null,
  heroImageUrl: null,
  storeName: "Mad Krapow",
  loading: true,
  error: null,
};

let brandingState: BrandingState = DEFAULT_STATE;
let fetchPromise: Promise<void> | null = null;
let lastFetchedAt = 0;
let hasFetched = false;
let channel: RealtimeChannel | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
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

function loadBranding(force = false): Promise<void> {
  const now = Date.now();
  if (!force && hasFetched && now - lastFetchedAt < BRANDING_CACHE_TTL_MS) {
    return Promise.resolve();
  }
  if (fetchPromise) return fetchPromise;

  if (!hasFetched && !brandingState.loading) {
    brandingState = { ...brandingState, loading: true };
    emit();
  }

  fetchPromise = fetchBrandingData()
    .then((result) => {
      brandingState = {
        logoUrl: result.logoUrl,
        heroImageUrl: result.heroImageUrl,
        storeName: result.storeName,
        loading: false,
        error: result.error,
      };
      hasFetched = true;
      lastFetchedAt = Date.now();
    })
    .catch((error: unknown) => {
      brandingState = {
        ...brandingState,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to load branding",
      };
      lastFetchedAt = Date.now();
    })
    .finally(() => {
      fetchPromise = null;
      emit();
    });

  return fetchPromise;
}

function ensureBrandingChannel(): void {
  if (channel || typeof window === "undefined") return;

  const supabase = getBrowserClient();
  channel = supabase
    .channel("store-branding")
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
          debounceTimer = null;
          void loadBranding(true);
        }, 300);
      }
    )
    .subscribe();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureBrandingChannel();
  void loadBranding();

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BrandingState {
  return brandingState;
}

function getServerSnapshot(): BrandingState {
  return DEFAULT_STATE;
}

export function useRealtimeBranding(): StoreBranding & {
  loading: boolean;
  error: string | null;
} {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
