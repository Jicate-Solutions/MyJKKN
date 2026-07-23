'use client';

/**
 * Cohort Core — M2 outcome-capture React Query hooks (Phase 7 · THE MOAT).
 * Purpose: Read captured-at-close outcome baselines (public.cohort_outcomes) and
 *          perform a manual / supplemental capture. The automatic capture is a
 *          DATABASE TRIGGER — these hooks never drive it; they surface + augment
 *          what the trigger records.
 * Connected to: lib/services/cohort-core/outcome-service.ts
 *
 * Query keys are defined LOCALLY here (cohortOutcomeKeys) to keep M2 self-
 * contained; when Phase 6 folds outcomes into the shared query-keys factory,
 * move this block into lib/query-keys.ts without touching the hook signatures.
 *
 * Created: 2026-07-05 (PLAN.md Phase 7 · M2)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  CohortOutcomeService,
  type CohortOutcomeFilters,
  type CreateCohortOutcomeDto,
} from '@/lib/services/cohort-core/outcome-service';

// ── Local query-key factory ───────────────────────────────────────────────────

export const cohortOutcomeKeys = {
  all: ['cohort-core', 'outcomes'] as const,
  list: (filters?: CohortOutcomeFilters) =>
    [...cohortOutcomeKeys.all, 'list', filters ?? null] as const,
  detail: (id: string) => [...cohortOutcomeKeys.all, 'detail', id] as const,
  byCohort: (cohortId: string) =>
    [...cohortOutcomeKeys.all, 'by-cohort', cohortId] as const,
  byMembership: (membershipId: string) =>
    [...cohortOutcomeKeys.all, 'by-membership', membershipId] as const,
} as const;

// ── Queries ───────────────────────────────────────────────────────────────────

export function useCohortOutcomes(filters?: CohortOutcomeFilters) {
  return useQuery({
    queryKey: cohortOutcomeKeys.list(filters),
    queryFn: () => CohortOutcomeService.getOutcomes(filters ?? {}),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useCohortOutcome(id: string) {
  return useQuery({
    queryKey: cohortOutcomeKeys.detail(id),
    queryFn: () => CohortOutcomeService.getOutcome(id),
    enabled: !!id,
    // A captured baseline is immutable — treat it as semi-stable.
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useCohortOutcomesByCohort(cohortId: string) {
  return useQuery({
    queryKey: cohortOutcomeKeys.byCohort(cohortId),
    queryFn: () => CohortOutcomeService.getOutcomesByCohort(cohortId),
    enabled: !!cohortId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useCohortOutcomeByMembership(membershipId: string) {
  return useQuery({
    queryKey: cohortOutcomeKeys.byMembership(membershipId),
    queryFn: () => CohortOutcomeService.getOutcomeByMembership(membershipId),
    enabled: !!membershipId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── Mutation — manual / supplemental capture ──────────────────────────────────

/**
 * Record a manual outcome baseline (the trigger handles automatic capture-at-
 * close). Invalidates the outcomes list, the affected cohort's list, and the
 * membership's baseline.
 */
export function useRecordCohortOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCohortOutcomeDto) =>
      CohortOutcomeService.recordOutcome(dto),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: cohortOutcomeKeys.all });
      queryClient.invalidateQueries({
        queryKey: cohortOutcomeKeys.byCohort(created.cohort_id),
      });
      if (created.membership_id) {
        queryClient.invalidateQueries({
          queryKey: cohortOutcomeKeys.byMembership(created.membership_id),
        });
      }
    },
  });
}
