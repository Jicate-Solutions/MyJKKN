// hooks/audit/use-carre-participant-activity.ts
// CARRE sealed-lane PARTICIPATION LINE (fn_carre_participant_activity,
// migration 20260725153000): a single cycle-level activity row — scorers,
// items_scored, last_activity — visible to leadership ONLY once the cycle
// has >= 3 distinct sealed scorers. The k-floor applies to the count itself
// (a "2 scorers" reveal could isolate voices), so below 3 the RPC returns
// nothing and this hook resolves to null. No identities, no lanes, no
// per-item data — the per-item medians stay with useCarreParticipantRollup.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface CarreParticipantActivity {
  scorers: number;
  items_scored: number;
  /** DATE (not timestamp) — recency without a submission-time fingerprint. */
  last_activity: string | null;
}

export const carreParticipantActivityKeys = {
  activity: (cycleId: string) =>
    ['audit', 'carre-evidence', 'participant-activity', cycleId] as const,
};

/**
 * k≥3-floored sealed-lane participation line (leadership only). Resolves to
 * null both when the caller is not leadership and when the cycle has fewer
 * than 3 distinct sealed scorers — the two cases are indistinguishable by
 * design.
 */
export function useCarreParticipantActivity(cycleId: string | undefined) {
  return useQuery({
    queryKey: carreParticipantActivityKeys.activity(cycleId ?? ''),
    queryFn: async (): Promise<CarreParticipantActivity | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc(
        'fn_carre_participant_activity',
        { p_cycle_id: cycleId },
      );
      if (error) throw error;
      const rows = (data ?? []) as CarreParticipantActivity[];
      return rows.length > 0 ? rows[0] : null;
    },
    enabled: !!cycleId,
    staleTime: 60 * 1000,
  });
}
