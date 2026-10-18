"use client";

/**
 * Shared, short-lived cache for the admin role lookup.
 *
 * The admin layout and every `useRoleGuard` caller need the same answer
 * ("who is signed in, and what staff role do they have?"). Without a cache
 * each of them issues its own `supabase.auth.getUser()` network round-trip on
 * mount, and the layout blocks the whole page behind a spinner while that
 * resolves.
 *
 * This module keeps one in-flight `getUser()` promise plus a five-minute
 * `{ user, role }` snapshot. The snapshot is updated (and listeners are
 * notified) from `supabase.auth.onAuthStateChange`, so signing in/out or a
 * role change invalidates it immediately. The cache lives in module scope, so
 * client-side navigation between admin pages resolves synchronously.
 *
 * The cache is intentionally browser-only: during SSR a module-level cache
 * would be shared across requests/users. A first visit therefore still shows
 * the guard's loading state, fetches once, and every admin navigation in that
 * tab afterwards is instant for the lifetime of the TTL.
 */

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";

export interface AdminAuthSnapshot {
  user: User | null;
  role: string | null;
}

/** Staff role TTL. Long enough to cover a navigation burst, short enough to revalidate. */
const CACHE_TTL_MS = 5 * 60 * 1000;

type AdminAuthListener = (snapshot: AdminAuthSnapshot) => void;

interface CacheEntry {
  snapshot: AdminAuthSnapshot;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let pending: Promise<AdminAuthSnapshot> | null = null;
let listenerInstalled = false;
let authEpoch = 0;
const listeners = new Set<AdminAuthListener>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function toSnapshot(user: User | null): AdminAuthSnapshot {
  return {
    user,
    role: (user?.app_metadata?.role as string | null | undefined) ?? null,
  };
}

function setSnapshot(snapshot: AdminAuthSnapshot): void {
  cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
  listeners.forEach((listener) => listener(snapshot));
}

function ensureAuthListener(): void {
  if (listenerInstalled || !isBrowser()) return;
  listenerInstalled = true;

  getBrowserClient().auth.onAuthStateChange(
    (event: AuthChangeEvent, session: Session | null) => {
      // The initial session is resolved by `getAdminAuth()`'s server-validated
      // `getUser()` call. Letting a stale INITIAL_SESSION overwrite that result
      // would reintroduce a race between the two auth paths.
      if (event === "INITIAL_SESSION") return;

      authEpoch += 1;
      setSnapshot(toSnapshot(session?.user ?? null));
    }
  );
}

/**
 * Synchronous read of the cached snapshot, or `null` when absent/expired.
 * Safe to call during render; never performs I/O.
 */
export function getCachedAdminAuth(): AdminAuthSnapshot | null {
  if (!isBrowser() || !cache) return null;
  if (cache.expiresAt <= Date.now()) {
    cache = null;
    return null;
  }
  return cache.snapshot;
}

/**
 * Resolve the current admin role snapshot.
 *
 * Returns the cached value without a network call when it is still fresh,
 * otherwise shares a single `getUser()` request between all concurrent
 * callers. Errors are propagated so callers can keep their existing
 * "deny on failure" behaviour; failures are not cached.
 */
export function getAdminAuth(): Promise<AdminAuthSnapshot> {
  const cached = getCachedAdminAuth();
  if (cached) return Promise.resolve(cached);

  ensureAuthListener();
  if (pending) return pending;

  const epoch = authEpoch;
  const request = getBrowserClient()
    .auth.getUser()
    .then((response: { data: { user: User | null }; error: unknown }) => {
      const { data, error } = response;
      if (error) throw error;

      const snapshot = toSnapshot(data.user);
      // An auth event that landed while the request was in flight is newer
      // than this response; never clobber it with the stale result.
      if (epoch === authEpoch) {
        cache = { snapshot, expiresAt: Date.now() + CACHE_TTL_MS };
      }
      return cache?.snapshot ?? snapshot;
    })
    .finally(() => {
      if (pending === request) pending = null;
    });

  pending = request;
  return request;
}

/** Subscribe to auth-state updates. Returns an unsubscribe function. */
export function subscribeAdminAuth(listener: AdminAuthListener): () => void {
  ensureAuthListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop the current snapshot (used on explicit invalidation/tests). */
export function invalidateAdminAuthCache(): void {
  authEpoch += 1;
  cache = null;
  pending = null;
}
