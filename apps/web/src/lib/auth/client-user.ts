"use client";

import { useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import type { RoleAwareUser } from "@/lib/auth/roles";

let cachedUser: RoleAwareUser | null = null;
let hasCachedUser = false;
let inFlight: Promise<RoleAwareUser | null> | null = null;
let authListenerBound = false;
let currentUser: RoleAwareUser | null = null;
let authEpoch = 0;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function publishUser(user: RoleAwareUser | null) {
  cachedUser = user;
  currentUser = user;
  hasCachedUser = true;
  emit();
}

function ensureAuthListener() {
  if (authListenerBound || typeof window === "undefined") return;
  authListenerBound = true;

  const supabase = getBrowserClient();
  supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    // `getUser()` is the authoritative server-validated result; an
    // INITIAL_SESSION event can carry the pre-hydration session and would race
    // with it. Every later event (sign-in/out, token refresh) is newer than any
    // in-flight request and must win.
    if (event === "INITIAL_SESSION") return;

    authEpoch += 1;
    publishUser(session?.user ?? null);
  });
}

/**
 * Shared `getUser()` result for the whole client app.
 *
 * Concurrent callers share one in-flight request and the resolved user is
 * cached for the session (until Supabase emits an auth event), so route
 * changes do not issue another `getUser()` round-trip. Failures are not
 * cached, so a later mount can retry.
 */
export async function getCachedClientUser(): Promise<RoleAwareUser | null> {
  if (typeof window === "undefined") return null;

  if (hasCachedUser) return cachedUser;

  if (inFlight) return inFlight;

  ensureAuthListener();

  const epoch = authEpoch;

  inFlight = (async () => {
    try {
      const supabase = getBrowserClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      // `getUser()` resolves (rather than throws) for network/auth API
      // failures. Treating that as a signed-out user would pin the header to
      // "signed out" for the whole session, so leave the cache unset and let
      // the next subscriber retry.
      if (error) return currentUser;

      const nextUser = user ?? null;
      // An auth event landed while this request was in flight; it is newer
      // than this response, so never overwrite the event's user.
      if (epoch !== authEpoch) return currentUser;

      publishUser(nextUser);
      return nextUser;
    } catch {
      if (epoch === authEpoch) {
        // Do not cache the failure: the next subscriber may retry.
        currentUser = null;
        emit();
      }
      return currentUser;
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
