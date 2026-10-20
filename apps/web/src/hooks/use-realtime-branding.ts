"use client";

import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { pickCanonicalBrandingRow } from "@/lib/branding";

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
let forceAfterFetch = false;
let channel: RealtimeChannel | null = null;
let channelCleanupTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

async function fetchBrandingData(): Promise<StoreBranding & { error: string | null }> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("store_branding")
    .select("id, logo_url, hero_image_url, store_name")
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return { logoUrl: null, heroImageUrl: null, storeName: "Mad Krapow", error: error.message };
  }

  const row = pickCanonicalBrandingRow(data ?? []);
  return {
    logoUrl: row?.logo_url ?? null,
    heroImageUrl: row?.hero_image_url ?? null,
    storeName: row?.store_name || "Mad Krapow",
    error: null,
  };
}

function loadBranding(force = false): Promise<void> {
  const now = Date.now();
  if (!force && hasFetched && now - lastFetchedAt < BRANDING_CACHE_TTL_MS) {
    return Promise.resolve();
  }
  if (fetchPromise) {
    // A realtime event that lands while a fetch is in flight must not be
    // lost: run one follow-up fetch after the current one settles.
    if (force) forceAfterFetch = true;
    return fetchPromise;
  }

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
      // Only cache successful reads; a transient DB error should be retried by
      // the next subscriber instead of being pinned for the full TTL.
      hasFetched = result.error === null;
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
      if (forceAfterFetch) {
        forceAfterFetch = false;
        void loadBranding(true);
      }
    });

  return fetchPromise;
}

function ensureBrandingChannel(): void {
  if (channelCleanupTimer) {
    clearTimeout(channelCleanupTimer);
    channelCleanupTimer = null;
  }
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
    // Unmount/remount of a shell happens in the same commit; wait a tick so a
    // new subscriber can reuse the existing channel instead of racing
    // `removeChannel()` and subscribing to the channel being torn down.
    if (listeners.size === 0 && channel && !channelCleanupTimer) {
      channelCleanupTimer = setTimeout(() => {
        channelCleanupTimer = null;
        if (listeners.size > 0 || !channel) return;

        const currentChannel = channel;
        channel = null;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        void getBrowserClient().removeChannel(currentChannel);
      }, 0);
    }
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
