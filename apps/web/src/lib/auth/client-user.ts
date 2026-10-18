"use client";

import { useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import type { RoleAwareUser } from "@/lib/auth/roles";

const USER_CACHE_TTL_MS = 60 * 1000;

let cachedUser: RoleAwareUser | null = null;
let cacheExpiresAt = 0;
let hasCachedUser = false;
let inFlight: Promise<RoleAwareUser | null> | null = null;
let authListenerBound = false;
let currentUser: RoleAwareUser | null = null;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function publishUser(user: RoleAwareUser | null) {
  cachedUser = user;
  currentUser = user;
  hasCachedUser = true;
  cacheExpiresAt = Date.now() + USER_CACHE_TTL_MS;
  emit();
}

function ensureAuthListener() {
  if (authListenerBound || typeof window === "undefined") return;
  authListenerBound = true;

  const supabase = getBrowserClient();
  supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    // Auth events carry the fresh session, so replace the cached user instead
    // of triggering another network round-trip.
    publishUser(session?.user ?? null);
  });
}

/**
 * Shared `getUser()` result for the whole client app.
 *
 * Concurrent callers share one in-flight request, the resolved user is cached
 * for a short TTL, and Supabase auth events refresh/invalidate the cache.
 */
export async function getCachedClientUser(): Promise<RoleAwareUser | null> {
  if (typeof window === "undefined") return null;

  if (hasCachedUser && Date.now() < cacheExpiresAt) {
    return cachedUser;
  }

  if (inFlight) {
    return inFlight;
  }

  ensureAuthListener();

  inFlight = (async () => {
    try {
      const supabase = getBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const nextUser = user ?? null;
      publishUser(nextUser);
      return nextUser;
    } catch {
      publishUser(null);
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  ensureAuthListener();
  void getCachedClientUser();

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): RoleAwareUser | null {
  return currentUser;
}

function getServerSnapshot(): RoleAwareUser | null {
  return null;
}

export function useClientUser(): RoleAwareUser | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
