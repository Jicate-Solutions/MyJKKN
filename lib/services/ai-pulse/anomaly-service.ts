// lib/services/ai-pulse/anomaly-service.ts
// Created: 2026-05-08 — AI Pulse module v3 (Wave B.5 Anomaly Review console)
//
// Backs: app/(routes)/ai-pulse/admin/anomalies/_components/{anomaly-list,
//        anomaly-row,review-dialog}.tsx (already on main from PR #730)
// Pairs with: ai_pulse_anomaly_flags table (migration 20260502, PR #644)
// RLS:        ai_pulse_anomaly_flags SELECT/UPDATE — `aiPulse:anomaly.review`
//             permission OR super_admin. INSERT super_admin only (cron uses
//             service_role bypass). DELETE super_admin only. (PR #715)
//
// History: PR #730 (UI) merged on 2026-05-07 referencing this module, but the
// service file was missing — broke the main build for ~14h. PR #768 originally
// shipped a stub here; this commit replaces the stub with the real
// implementation now that substrate (#644 + #715) has merged.
//
// Pattern reference: lib/services/ai-pulse/policies-service.ts (sibling
// service that reads/writes ai_pulse_policies the same way).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ============================================================================
// Types — derived from ai_pulse_anomaly_flags schema (PR #644 migration §D)
// ============================================================================

export type AnomalyFlagType =
  | 'intra_dept_scoring_outlier'
  | 'random_poll_response_pattern'
  | 'ig_reach_inconsistent'
  | 'rotation_gaming'
  | 'excuse_frequency_outlier';

export type AnomalyReviewOutcome =
  | 'pending'
  | 'confirmed_anomaly'
  | 'false_positive'
  | 'inconclusive';

export interface AnomalyFlagRow {
  id: string;
  startup_event_id: string;
  flag_type: AnomalyFlagType;
  target_user_id: string | null;
  signal_value: number | null;
  signal_threshold: number | null;
  details_json: unknown;
  reviewed_by: string | null;
  review_outcome: AnomalyReviewOutcome;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

// ============================================================================
// React Query keys
// ============================================================================

const QUERY_KEY_ROOT = ['ai-pulse', 'anomaly-flags'] as const;

// ============================================================================
// useAnomalyFlagsList — read with filter
// ============================================================================

interface AnomalyFlagsFilters {
  flag_type: AnomalyFlagType | 'all';
  status: 'pending' | 'all';
}

export function useAnomalyFlagsList(filters: AnomalyFlagsFilters) {
  return useQuery<AnomalyFlagRow[], Error>({
    queryKey: [...QUERY_KEY_ROOT, 'list', filters],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('ai_pulse_anomaly_flags')
        .select(
          'id, startup_event_id, flag_type, target_user_id, signal_value, signal_threshold, details_json, reviewed_by, review_outcome, review_notes, reviewed_at, created_at'
        )
        .order('created_at', { ascending: false });

      if (filters.flag_type !== 'all') {
        query = query.eq('flag_type', filters.flag_type);
      }

      if (filters.status === 'pending') {
        query = query.eq('review_outcome', 'pending');
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ai-pulse/anomaly] list failed:', error);
        throw new Error(error.message);
      }

      return (data ?? []) as AnomalyFlagRow[];
    },
    staleTime: 30_000,
  });
}

// ============================================================================
// useReviewAnomalyFlag — Champion / Co-Champion records verdict
// ============================================================================

interface ReviewAnomalyFlagInput {
  id: string;
  outcome: Exclude<AnomalyReviewOutcome, 'pending'>;
  notes: string | null;
  reviewerId: string;
}

export function useReviewAnomalyFlag() {
  const queryClient = useQueryClient();

  return useMutation<AnomalyFlagRow, Error, ReviewAnomalyFlagInput>({
    mutationFn: async ({ id, outcome, notes, reviewerId }) => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('ai_pulse_anomaly_flags')
        .update({
          review_outcome: outcome,
          review_notes: notes,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(
          'id, startup_event_id, flag_type, target_user_id, signal_value, signal_threshold, details_json, reviewed_by, review_outcome, review_notes, reviewed_at, created_at'
        )
        .single();

      if (error) {
        console.error('[ai-pulse/anomaly] review failed:', error);
        throw new Error(error.message);
      }

      return data as AnomalyFlagRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_ROOT });
    },
  });
}
