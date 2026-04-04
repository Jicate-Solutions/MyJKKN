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
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('usage_events')
        .select('module, metadata')
        .eq('event_type', 'page_visit')
        .eq('institution_id', profile?.institution_id || '')
        .gte('created_at', sevenDaysAgo)
        .limit(1000);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Count visits per module/path
      const counts = new Map<string, { module: string; path: string; count: number }>();
      for (const event of data) {
        const path = (event.metadata as any)?.page_path || `/${event.module?.replace(/\//g, '/')}`;
        const key = path;
        const existing = counts.get(key);
        if (existing) {
          existing.count++;
        } else {
          counts.set(key, { module: event.module || '', path, count: 1 });
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
