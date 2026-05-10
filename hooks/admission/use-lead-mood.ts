// hooks/admission/use-lead-mood.ts
// Re-exports of lead-mood React Query hooks for clean import paths.
// Mirrors the pattern in hooks/admission/use-counselor-pulse.ts.
//
// Optional realtime subscription on admission_call_intelligence INSERT events
// is included so the page auto-invalidates whenever the analyze cron lands a
// new row, supplementing the 30s refetchInterval.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { leadMoodKeys } from '@/lib/services/admission/lead-mood-service';

export {
  useTodayMoodKPIs,
  useMoodDistributionByCounselor,
  useMoodDistributionByInstitution,
  useTopConcerns,
  useAnxiousLeads,
  leadMoodKeys,
} from '@/lib/services/admission/lead-mood-service';
export type {
  MoodKPIs,
  MoodDistribution,
  TopConcern,
  AnxiousLeadRow,
} from '@/lib/services/admission/lead-mood-service';

/**
 * Realtime subscription on admission_call_intelligence INSERTs.
 * Invalidates lead-mood query caches so KPIs + anxious-lead list
 * auto-refresh whenever the analyze cron lands a new row.
 */
export function useLeadMoodRealtime(institutionId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    const channelName = `lead-mood-${institutionId || 'all'}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admission_call_intelligence',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: leadMoodKeys.all });
        },
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admission_call_intelligence',
        },
        () => {
          // UPDATE matters too — the analyze cron flips analyze_status
          // and writes sentiment / summary in an UPDATE, not an INSERT
          queryClient.invalidateQueries({ queryKey: leadMoodKeys.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [institutionId, queryClient]);
}
