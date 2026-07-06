'use client';

/**
 * Cohort Core — Phase 7 (THE MOAT) React Query hooks.
 * Purpose: read/compute experiments, propose/review/apply feed-forward
 *          adjustments, and browse the alumni→mentor pool.
 * Connected to: lib/services/cohort-core/experiment-service.ts
 *               lib/services/cohort-core/feedforward-service.ts
 *               lib/services/cohort-core/alumni-mentor-service.ts
 *
 * Query keys are LOCAL to this file (a self-contained `moatKeys` factory) to keep
 * the moat PR from conflicting with the shared lib/query-keys.ts registry; fold
 * them into cohortKeys in a later consolidation if desired.
 * Created: 2026-07-06 (PLAN.md Phase 7 · M7.1–M7.4)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { CohortExperimentService } from '@/lib/services/cohort-core/experiment-service';
import {
  CohortFeedForwardService,
  type ProposalFilters,
} from '@/lib/services/cohort-core/feedforward-service';
import {
  AlumniMentorService,
  type AlumniMentorFilters,
} from '@/lib/services/cohort-core/alumni-mentor-service';

const moatKeys = {
  experiment: (cohortId: string) => ['cohort-core', 'experiment', cohortId] as const,
  proposals: (filters?: ProposalFilters) => ['cohort-core', 'proposals', filters ?? {}] as const,
  alumni: (filters?: AlumniMentorFilters) => ['cohort-core', 'alumni-mentor', filters ?? {}] as const,
};

// ── Experiments (M7.2) ────────────────────────────────────────────────────────

export function useCohortExperiment(cohortId: string) {
  return useQuery({
    queryKey: moatKeys.experiment(cohortId),
    queryFn: () => CohortExperimentService.getExperiment(cohortId),
    enabled: !!cohortId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useComputeExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cohortId: string) => CohortExperimentService.computeExperiment(cohortId),
    onSuccess: (_data, cohortId) => {
      qc.invalidateQueries({ queryKey: moatKeys.experiment(cohortId) });
    },
  });
}

export function useAssignExperimentArms() {
  return useMutation({
    mutationFn: (cohortId: string) => CohortExperimentService.assignArms(cohortId),
  });
}

// ── Feed-forward proposals (M7.3) ─────────────────────────────────────────────

export function useCohortProposals(filters?: ProposalFilters) {
  return useQuery({
    queryKey: moatKeys.proposals(filters),
    queryFn: () => CohortFeedForwardService.listProposals(filters ?? {}),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useProposeAdjustments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cohortId: string) => CohortFeedForwardService.propose(cohortId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-core', 'proposals'] }),
  });
}

export function useApproveProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { proposalId: string; reviewerId: string }) =>
      CohortFeedForwardService.approve(v.proposalId, v.reviewerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-core', 'proposals'] }),
  });
}

export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { proposalId: string; reviewerId: string }) =>
      CohortFeedForwardService.reject(v.proposalId, v.reviewerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-core', 'proposals'] }),
  });
}

export function useApplyProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { proposalId: string; actorId: string }) =>
      CohortFeedForwardService.apply(v.proposalId, v.actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-core', 'proposals'] }),
  });
}

/** Operator action: analyze a program's closed cohorts and emit any proposals. */
export function useGenerateAdjustments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (programId: string) => CohortFeedForwardService.generateForProgram(programId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-core', 'proposals'] }),
  });
}

// ── Alumni → mentor flywheel (M7.4) ───────────────────────────────────────────

export function useAlumniMentorPool(filters?: AlumniMentorFilters) {
  return useQuery({
    queryKey: moatKeys.alumni(filters),
    queryFn: () => AlumniMentorService.getPool(filters ?? {}),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useEnrollAsMentor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { targetCohortId: string; alumProfileId: string; joinedBy?: string }) =>
      AlumniMentorService.enrollAsMentor(v.targetCohortId, v.alumProfileId, v.joinedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cohort-core', 'alumni-mentor'] }),
  });
}
