'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { getModuleBySlug } from '@/lib/navigation/modules';
import type { RecentPage } from '@/lib/navigation/types';

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
      const supabase = createClientSupabaseClient();

      // Aggregate RPC (SECURITY DEFINER): top-level module keys + visit counts
      // for the caller's OWN institution, only for modules 3+ people visited —
      // no paths, no user ids (20271010094500_usage_events_rls_hardening).
      // Over-fetch: keys this client has no hub for are dropped below.
      const { data, error } = await supabase.rpc('fn_usage_trending_pages' as never, {
        p_days: 7,
        p_limit: Math.min(limit * 4, 50),
      } as never);

      if (error) throw error;
      const rows = (data ?? []) as Array<{ module: string | null; visit_count: number | string }>;

      const pages: RecentPage[] = [];
      for (const row of rows) {
        // The href comes from the app's own module list, never from DB text;
        // a key with no known module is dropped. '' (the Dashboard root) is
        // never a key the RPC returns.
        const mod = row.module ? getModuleBySlug(row.module) : undefined;
        if (!mod || !mod.slug) continue;
        pages.push({
          path: `/${mod.slug}`,
          title: mod.label,
          module: mod.slug,
          iconName: 'TrendingUp',
          visitedAt: new Date().toISOString(),
          visitCount: Number(row.visit_count) || 0,
        });
        if (pages.length >= limit) break;
      }
      return pages;
    },
    enabled: !!profile?.institution_id,
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
}
