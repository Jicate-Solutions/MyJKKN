// ============================================================================
// AI PULSE ANOMALY SERVICE — STUB.
//
// CONTEXT: This file was left missing when PRs #729 + #730 merged on
// 2026-05-07. Both PRs imported `useAnomalyFlagsList`, `useReviewAnomalyFlag`,
// and the three Anomaly* types from this module path; neither created the
// module itself. Result: jicate/main npm run build failed for ~24 hours,
// blocking ALL Vercel auto-deploys (including the Coordination PR #767's
// effects, the HR/Appraisal program substrate).
//
// THIS STUB unblocks the build by exporting the names #729/#730 import,
// with no-op runtime behavior:
//   - useAnomalyFlagsList → returns empty array, no loading, no error.
//     The consumer page (`/ai-pulse/admin/anomalies`) renders gracefully
//     with the "you are caught up — no pending flags" empty state.
//   - useReviewAnomalyFlag → throws on mutateAsync. If a Champion clicks
//     "Save review", they see an honest "Service not yet implemented"
//     toast that signals to the AI Pulse track owner that this stub
//     needs replacing before the page is functional.
//
// REPLACE THIS STUB by implementing the real service. The substrate
// (ai_pulse_anomaly_flags table) lives in PR #644; the RLS policies live
// in PR #715; the permission key is `aiPulse:anomaly.review` from PR #716.
// The real service should:
//   - useAnomalyFlagsList: React Query SELECT from ai_pulse_anomaly_flags
//     filtered by { flag_type, status }, returning AnomalyFlagRow[].
//   - useReviewAnomalyFlag: React Query mutation that UPDATEs
//     review_outcome / review_notes / reviewed_by / reviewed_at on a row,
//     then invalidates the list query.
//
// Type unions and the row interface here are derived verbatim from the
// consumer files (anomaly-list.tsx / review-dialog.tsx / anomaly-row.tsx)
// so the stub matches what those consumers already expect.
// ============================================================================

'use client';

// ---------------------------------------------------------------------------
// Type unions — sourced from how the consumer files use them. Keep in sync
// with the eventual real service; consumers reference these by structural
// shape, so changing them here means updating the consumer files too.
// ---------------------------------------------------------------------------

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
  flag_type: AnomalyFlagType;
  target_user_id: string | null;
  signal_value: number | null;
  signal_threshold: number | null;
  startup_event_id: string | null;
  review_outcome: AnomalyReviewOutcome;
  review_notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Hook stubs. Shape mirrors React Query's useQuery / useMutation surface
// (data / isLoading / error / mutateAsync / isPending) because the consumer
// pages destructure those names directly.
// ---------------------------------------------------------------------------

interface AnomalyFlagsListFilters {
  flag_type: AnomalyFlagType | 'all';
  status: 'pending' | 'all';
}

interface UseAnomalyFlagsListResult {
  data: AnomalyFlagRow[] | undefined;
  isLoading: boolean;
  error: unknown;
}

/**
 * STUB: returns an empty list, never loading, never errored. The consumer
 * page renders the "no pending flags — you are caught up" empty state.
 * Replace with React Query useQuery against ai_pulse_anomaly_flags.
 */
export function useAnomalyFlagsList(
  _filters: AnomalyFlagsListFilters,
): UseAnomalyFlagsListResult {
  return {
    data: [],
    isLoading: false,
    error: null,
  };
}

interface ReviewAnomalyFlagVars {
  id: string;
  outcome: AnomalyReviewOutcome;
  notes: string | null;
  reviewerId: string;
}

interface UseReviewAnomalyFlagResult {
  mutateAsync: (vars: ReviewAnomalyFlagVars) => Promise<void>;
  isPending: boolean;
}

/**
 * STUB: mutateAsync throws so the consumer's catch block fires the
 * "Failed to save review" toast. This intentional failure mode signals
 * to the AI Pulse track owner that the stub still needs replacing.
 * Replace with React Query useMutation that UPDATEs ai_pulse_anomaly_flags.
 */
export function useReviewAnomalyFlag(): UseReviewAnomalyFlagResult {
  return {
    mutateAsync: async () => {
      throw new Error(
        '[anomaly-service stub] Real service not yet implemented. ' +
          'Replace lib/services/ai-pulse/anomaly-service.ts with the ' +
          'React Query mutation that writes to ai_pulse_anomaly_flags.',
      );
    },
    isPending: false,
  };
}
