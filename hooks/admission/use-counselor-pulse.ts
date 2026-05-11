// hooks/admission/use-counselor-pulse.ts
// Realtime subscription on admission_call_logs INSERTs.
// Invalidates director-pulse query caches so KPI strip + live feed
// auto-refresh when a counselor places a new call.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { directorPulseKeys } from '@/lib/services/admission/director-pulse-service';

export function useCounselorPulseRealtime(institutionId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    const channelName = `director-pulse-${institutionId || 'all'}`;

    const channel = supabase
      .channel(channelName)
      .on(
        // postgres_changes payload type from supabase-js v2
        // (cast to any so we don't need to import server-only types)
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admission_call_logs',
        },
        () => {
          // Invalidate all director-pulse caches — KPIs, today breakdown,
          // silent list, live feed all depend on admission_call_logs rows.
          queryClient.invalidateQueries({ queryKey: directorPulseKeys.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [institutionId, queryClient]);
}
