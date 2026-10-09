'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { RecentPage } from '@/lib/navigation/types';

/**
 * Hook to fetch trending/popular pages from usage_events.
 * Returns the most-visited pages across the institution in the last 7 days.
 */
export function useTrendingPages(limit: number = 5) {
  const { profile } = useAuth();

  return useQuery<RecentPage[]>({
    queryKey: ['trending-pages', profile?.institution_id, limit],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();

      // Aggregate RPC (SECURITY DEFINER): top page paths + visit counts for the
      // caller's OWN institution, no user ids. Raw usage_events rows are readable
      // only by institution admins (20271010090000_usage_events_rls_hardening).
      const { data, error } = await supabase.rpc('fn_usage_trending_pages' as never, {
        p_days: 7,
        p_limit: limit,
      } as never);

      if (error) throw error;
      const rows = (data ?? []) as Array<{
        module: string | null;
        page_path: string;
        visit_count: number | string;
      }>;
      if (rows.length === 0) return [];

      // Count visits per module/path
      const counts = new Map<string, { module: string; path: string; count: number }>();
      for (const row of rows) {
        const path = row.page_path;
        const existing = counts.get(path);
        if (existing) {
          existing.count += Number(row.visit_count) || 0;
        } else {
          counts.set(path, { module: row.module || '', path, count: Number(row.visit_count) || 0 });
        }
      }

      // Sort by count and return top N
      return Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((item) => ({
          path: item.path,
          title: item.module?.split('/').pop()?.replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase()) || item.path,
          module: item.module?.split('/')[0] || 'Other',
          iconName: 'TrendingUp',
          visitedAt: new Date().toISOString(),
          visitCount: item.count,
        }));
    },
    enabled: !!profile?.institution_id,
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
}
