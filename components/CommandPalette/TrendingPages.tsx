'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { getModuleBySlug } from '@/lib/navigation/modules';
import type { RecentPage } from '@/lib/navigation/types';
import { MODULE_NAMES } from '@/types/analytics';

/**
 * Usage keys that differ from their lib/navigation/modules.ts slug. Each key
 * is written by lib/middleware/url-module-mapper.ts for pages UNDER the target
 * hub, and every target hub route exists in app/(routes). Values are module
 * slugs from our own list; the href still comes from getModuleBySlug().
 *   students     → learners         (/learners/* pages log 'students'; the #2
 *                                     key live, 85,292 visits in 30 days;
 *                                     /learners is a 307 to /learners/profiles)
 *   organization → organizations    (/organizations/{institutions,…} log
 *                                     'organization/…'; /organizations route.ts)
 *   bug-reports  → my-bug-reports   (/my-bug-reports and /admin/bug-reports
 *                                     log 'bug-reports'; /my-bug-reports is the
 *                                     page every user can open)
 * LEFT OUT (dropped): cdc, instasolver, guide and the my-* pages (my-desk,
 * my-kit, my-proof, …). Their hubs exist, but modules.ts has no entry for
 * them — no label or icon to show — and adding one changes the module list
 * the rest of the app reads, which is beyond this fix.
 */
const USAGE_KEY_ALIASES: Record<string, string> = {
  // Keys are the mapper's own MODULE_NAMES values (top-level part).
  [MODULE_NAMES.STUDENTS]: 'learners',
  [MODULE_NAMES.ORGANIZATION_INSTITUTIONS.split('/')[0]]: 'organizations',
  [MODULE_NAMES.BUG_REPORTS]: 'my-bug-reports',
};

/**
 * Hook to fetch trending modules from usage_events.
 * Returns the most-visited modules across the institution in the last 7 days,
 * each linked to its module hub.
 */
export function useTrendingPages(limit: number = 5) {
  const { profile } = useAuth();

  return useQuery<RecentPage[]>({
    queryKey: ['trending-pages', profile?.institution_id, limit],
    queryFn: async () => {
      if (!(limit > 0)) return [];
      const want = Math.ceil(limit);
      const supabase = createClientSupabaseClient();

      // Aggregate RPC (SECURITY DEFINER): top-level module keys + visit counts
      // for the caller's OWN institution, only for modules 3+ people visited —
      // no paths, no user ids (20271011110000_usage_events_rls_hardening).
      // Over-fetch: keys this client has no hub for are dropped below.
      //
      // Trending is optional: any RPC failure — PGRST202 / 42883 while the
      // migration is not yet applied, or anything else — means "no trending",
      // never an error thrown into the palette.
      let data: unknown;
      try {
        const res = await supabase.rpc('fn_usage_trending_pages' as never, {
          p_days: 7,
          p_limit: Math.min(want * 4, 50),
        } as never);
        if (res.error) {
          console.warn('[trending] fn_usage_trending_pages unavailable:', res.error.code ?? res.error.message);
          return [];
        }
        data = res.data;
      } catch (e) {
        console.warn('[trending] fn_usage_trending_pages failed:', e);
        return [];
      }
      const rows = (data ?? []) as Array<{ module: string | null; visit_count: number | string }>;

      const pages: RecentPage[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        // The href comes from the app's own module list, never from DB text;
        // a key with no known module is dropped. '' (the Dashboard root) is
        // never a key the RPC returns. ('dashboard' IS a modules.ts slug —
        // Dashboard (Classic), /dashboard — and is kept.)
        const raw = row.module || '';
        const key = Object.prototype.hasOwnProperty.call(USAGE_KEY_ALIASES, raw)
          ? USAGE_KEY_ALIASES[raw]
          : raw;
        const mod = key ? getModuleBySlug(key) : undefined;
        if (!mod || !mod.slug || seen.has(mod.slug)) continue;
        seen.add(mod.slug);
        pages.push({
          path: `/${mod.slug}`,
          title: mod.label,
          module: mod.slug,
          iconName: 'TrendingUp',
          visitedAt: new Date().toISOString(),
          visitCount: Number(row.visit_count) || 0,
        });
        if (pages.length >= want) break;
      }
      return pages;
    },
    enabled: !!profile?.institution_id,
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
}
