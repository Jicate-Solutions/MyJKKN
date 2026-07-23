'use client';

/**
 * Projects Portfolio — React Query hook + Realtime refresh
 *
 * Wraps PortfolioService.getPortfolio (aggregate cross-institution read) and
 * keeps the dashboard live by subscribing to `projects` table changes via
 * Supabase Realtime. Any insert/update/delete on `projects` invalidates the
 * portfolio query so the grid / board / heatmap refresh without a manual reload.
 *
 * Realtime requires the `projects` table to be in the supabase_realtime
 * publication. If the channel never reaches 'SUBSCRIBED' (publication not
 * enabled, or Realtime disabled for the project), we fall back to a polling
 * refetch interval and surface `realtimeDegraded = true` so the UI can flag it.
 *
 * Pattern: hooks/admission/use-group-dashboard.ts (module-scope channel ref +
 * invalidate-on-change), hooks/projects/use-projects.ts (query-key factory).
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { PortfolioService } from '@/lib/services/projects/portfolio-service';
import { projectKeys } from './use-projects';

// Polling cadence used only when Realtime is unavailable.
const FALLBACK_REFETCH_MS = 30_000;

function getSupabase() {
  return createClientSupabaseClient();
}

export const portfolioKeys = {
  all: [...projectKeys.all, 'portfolio'] as const,
};

/**
 * Load the full portfolio dataset and keep it live.
 *
 * @returns the React Query result plus `realtimeDegraded` — true when the
 *   Realtime channel could not subscribe and we downgraded to polling.
 */
export function usePortfolio() {
  const queryClient = useQueryClient();
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);

  const query = useQuery({
    queryKey: portfolioKeys.all,
    queryFn: () => PortfolioService.getPortfolio(getSupabase()),
    // Polling kicks in only after we mark Realtime as degraded.
    refetchInterval: realtimeDegraded ? FALLBACK_REFETCH_MS : false,
  });

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    const channel = supabase
      .channel('projects-portfolio-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
        }
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeDegraded(false);
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          // Realtime unavailable → degrade to polling.
          setRealtimeDegraded(true);
        }
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // queryClient is stable; subscribe once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...query, realtimeDegraded };
}
