'use client';

/**
 * The ONE client-side reader for the exam attendance eligibility thresholds.
 *
 * Before 2026-07-26 the 75/65 pair was typed literally into four unrelated
 * places (exam-audit compute, the learner's running-score card, the consolidation
 * advisory panel, and the Senior Learner guide prose), with no config row anywhere
 * and no authority beyond a comment reading "// university norm". Director approved
 * consolidating it. Every client surface that renders or compares against these
 * numbers must read them from here.
 *
 * Server callers do NOT use this hook — they read the same two policy keys via
 * getPolicyInt() from '@/lib/policies/get-policy' (see the exam-audit API route).
 *
 * Returns the compute.ts defaults (75/65) while loading and on any RPC failure, so
 * a caller never renders a threshold of 0 or NaN during the round-trip.
 */

import { useQuery } from '@tanstack/react-query';
import { getPolicyInt } from '@/lib/policies/get-policy-client';
import { POLICY_KEYS } from '@/lib/policies/keys';
import {
  DEFAULT_ELIGIBILITY_THRESHOLDS,
  type EligibilityThresholds,
} from '@/lib/services/exam-audit/compute';

export const eligibilityThresholdKeys = {
  all: ['exam-eligibility-thresholds'] as const,
  scoped: (institutionId?: string | null) =>
    [...eligibilityThresholdKeys.all, institutionId ?? 'global'] as const,
};

/**
 * @param institutionId optional institution scope. fn_get_policy resolves
 *   user > institution > role > global, so passing it lets a college on a
 *   different affiliating-university norm override the global row.
 */
export function useEligibilityThresholds(institutionId?: string | null): {
  thresholds: EligibilityThresholds;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: eligibilityThresholdKeys.scoped(institutionId),
    queryFn: async (): Promise<EligibilityThresholds> => ({
      eligibility: await getPolicyInt(
        POLICY_KEYS.EXAM_ELIGIBILITY_ATTENDANCE_PCT,
        DEFAULT_ELIGIBILITY_THRESHOLDS.eligibility,
        institutionId,
      ),
      condonation: await getPolicyInt(
        POLICY_KEYS.EXAM_ELIGIBILITY_CONDONATION_FLOOR_PCT,
        DEFAULT_ELIGIBILITY_THRESHOLDS.condonation,
        institutionId,
      ),
    }),
    // Thresholds change at most once an academic year — cache hard.
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  return {
    thresholds: data ?? DEFAULT_ELIGIBILITY_THRESHOLDS,
    isLoading,
  };
}
