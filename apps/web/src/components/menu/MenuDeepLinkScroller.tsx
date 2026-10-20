"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

interface MenuDeepLinkTarget {
  /** Value of the ?category= param for the category. */
  slug: string;
  /** DOM id of the section to land on. */
  elementId: string;
}

/**
 * Scrolls to a menu section when the URL asks for it: ?category=<slug> deep
 * links, shared URLs and footer category links.
 *
 * Kept apart from MenuCatalogView on purpose — `useSearchParams` opts its
 * subtree into client-side rendering during the static prerender, so the
 * catalog wraps this in its own Suspense boundary and the storefront itself
 * still renders on the server.
 */
export function MenuDeepLinkScroller({ targets }: { targets: MenuDeepLinkTarget[] }) {
  const searchParams = useSearchParams();
  const slug = searchParams.get("category");
  const lastScrolledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || lastScrolledRef.current === slug) return;
    const target = targets.find((entry) => entry.slug === slug);
    if (!target) return;
    const el = document.getElementById(target.elementId);
    if (!el) return;
    // Once per slug: a later re-render (router.refresh, new categories
    // identity) must not yank the user back to the section while browsing.
    lastScrolledRef.current = slug;
    // Instant, not smooth: on first paint a smooth scroll from the top would
    // animate past the whole page.
    requestAnimationFrame(() =>
      el.scrollIntoView({ block: "start", behavior: "instant" })
    );
  }, [slug, targets]);

  return null;
}
