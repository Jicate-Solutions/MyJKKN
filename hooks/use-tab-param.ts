'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-synced tab state. Mirrors the active tab to `?tab=` (or a custom param)
 * so every tab is deep-linkable, shareable, and favoritable — the global
 * navbar FavoriteStar reads `?tab=` and favorites the specific tab
 * (see lib/navigation/derive-page-info.ts + components/Navbar/Navbar.tsx).
 *
 * System standard (decided 2026-07-17, applies to every tabbed page):
 *  - ALWAYS-SHOW: on mount, if the URL has no valid tab param, the default
 *    tab is written into the URL immediately, so even the default/first tab
 *    is a directly shareable & favoritable address.
 *  - BACK EXITS PAGE: tab changes use router.replace() — no per-tab history
 *    entry — so one Back press leaves the page instead of stepping back
 *    through tabs one at a time.
 *  - TYPO-SAFE: an unknown/invalid tab value falls back to defaultTab
 *    (no error page, no blank screen).
 *  - Any OTHER query params already on the URL are preserved when the tab
 *    param is rewritten.
 *
 * MUST be called inside a <Suspense> boundary, because it uses
 * useSearchParams(). Standard wrapper: export the page as
 *   export default function Page() {
 *     return <Suspense fallback={null}><Client /></Suspense>;
 *   }
 *
 * Usage:
 *   const TABS = ['overview', 'details', 'history'] as const;
 *   const [activeTab, setActiveTab] = useTabParam('overview', TABS);
 *   <Tabs value={activeTab} onValueChange={setActiveTab}> ... </Tabs>
 */
export function useTabParam<T extends string>(
  defaultTab: T,
  validTabs: readonly T[],
  paramKey: string = 'tab'
): [T, (tab: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(paramKey);
  const isValid = (t: string | null): t is T =>
    !!t && (validTabs as readonly string[]).includes(t);
  const active: T = isValid(raw) ? raw : defaultTab;

  // Rewrite the tab param while preserving every other query param
  // (e.g. a page that also uses ?id= or ?filter=).
  const buildUrl = useCallback(
    (tab: T) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(paramKey, tab);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams, paramKey]
  );

  // ALWAYS-SHOW: stamp the default tab into the URL on mount when the param
  // is absent or invalid. router.replace keeps this out of the history stack
  // so Back still exits the page.
  useEffect(() => {
    if (!isValid(raw)) {
      router.replace(buildUrl(defaultTab), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setActive = useCallback(
    (tab: T) => {
      router.replace(buildUrl(tab), { scroll: false });
    },
    [router, buildUrl]
  );

  return [active, setActive];
}
