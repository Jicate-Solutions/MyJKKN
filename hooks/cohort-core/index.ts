'use client';

/**
 * Cohort Core — React Query hooks (shared cohort spine)
 * Purpose: Read/mutate cohorts, memberships and lifecycle transitions.
 * Connected to: lib/services/cohort-core/cohort-service.ts
 *               lib/query-keys.ts (cohortKeys)
 *
 * NOTE ON DATA LAYER: the dominant repo hooks pattern calls `apiClient` against
 * /api/* routes. Cohort Core Phase 1 ships NO API routes (it is an additive DB
 * spine consumed directly by the session-scoped browser Supabase client), so
 * these hooks wrap `CohortService` directly in queryFn/mutationFn. When Phase 6
 * adds shared UI + API routes, swap the service calls for apiClient without
 * touching the key factory or cache profiles.
 *
 * Created: 2026-07-05 (PLAN.md Phase 1.6)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cohortKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { CohortService } from '@/lib/services/cohort-core/cohort-service';
import type {
  CohortFilters,
  CreateCohortDto,
  UpdateCohortDto,
  CreateMembershipDto,
  UpdateMembershipDto,
  RecordStatusEventDto,
  TransitionOptions,
  TransferMembershipDto,
  CloseCohortDto,
  CohortKind,
  CohortStatus,
  MembershipStatus,
} from '@/lib/types/cohort-core';

// ── Cohort queries ────────────────────────────────────────────────────────────

export function useCohorts(filters?: CohortFilters) {
  return useQuery({
    queryKey: cohortKeys.cohorts.list(filters as Record<string, unknown>),
    queryFn: () => CohortService.getCohorts(filters ?? {}),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useCohort(cohortId: string) {
  return useQuery({
    queryKey: cohortKeys.cohorts.detail(cohortId),
    queryFn: () => CohortService.getCohort(cohortId),
    enabled: !!cohortId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useCohortsByKind(kind: CohortKind, institutionId?: string) {
  return useQuery({
    queryKey: cohortKeys.cohorts.byKind(kind, institutionId),
    queryFn: () => CohortService.getCohortsByKind(kind, institutionId),
    enabled: !!kind,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ── Cohort mutations ──────────────────────────────────────────────────────────

export function useCreateCohort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCohortDto) => CohortService.createCohort(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.all });
    },
  });
}

export function useUpdateCohort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & UpdateCohortDto) =>
      CohortService.updateCohort(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.detail(updated.id) });
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.all });
    },
  });
}

export function useDeleteCohort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CohortService.deleteCohort(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.all });
    },
  });
}

export function useTransitionCohortStatus(cohortId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ toStatus, ...opts }: { toStatus: CohortStatus } & TransitionOptions) =>
      CohortService.transitionCohortStatus(cohortId, toStatus, opts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.detail(cohortId) });
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.all });
      queryClient.invalidateQueries({ queryKey: cohortKeys.events({ cohortId }) });
    },
  });
}

// ── Membership queries ────────────────────────────────────────────────────────

export function useCohortMemberships(
  cohortId: string,
  filters?: { member_type?: string; status?: string }
) {
  return useQuery({
    queryKey: cohortKeys.memberships.list(cohortId, filters as Record<string, unknown>),
    queryFn: () => CohortService.getMemberships(cohortId, filters ?? {}),
    enabled: !!cohortId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useCohortMembership(membershipId: string) {
  return useQuery({
    queryKey: cohortKeys.memberships.detail(membershipId),
    queryFn: () => CohortService.getMembership(membershipId),
    enabled: !!membershipId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ── Membership mutations ──────────────────────────────────────────────────────

export function useCreateMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateMembershipDto) => CohortService.createMembership(dto),
    onSuccess: (created) => {
      queryClient.invalidateQueries({
        queryKey: cohortKeys.memberships.list(created.cohort_id),
      });
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.all });
    },
  });
}

export function useUpdateMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string } & UpdateMembershipDto) =>
      CohortService.updateMembership(id, dto),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.detail(updated.id) });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.memberships.list(updated.cohort_id),
      });
    },
  });
}

export function useDeleteMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    // cohortId is passed so we can target the affected list on invalidation.
    mutationFn: ({ id }: { id: string; cohortId?: string }) =>
      CohortService.deleteMembership(id),
    onSuccess: (_data, variables) => {
      if (variables.cohortId) {
        queryClient.invalidateQueries({
          queryKey: cohortKeys.memberships.list(variables.cohortId),
        });
      }
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.all });
    },
  });
}

/**
 * Lifecycle transition for a membership (validated against the transition map
 * in lifecycle.ts, and audited). Invalidates the membership + its cohort's
 * memberships list + the event stream.
 */
export function useTransitionMembershipStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      toStatus,
      ...opts
    }: { membershipId: string; toStatus: MembershipStatus } & TransitionOptions) =>
      CohortService.transitionStatus(membershipId, toStatus, opts),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.detail(updated.id) });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.memberships.list(updated.cohort_id),
      });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.events({ membershipId: updated.id }),
      });
    },
  });
}

/**
 * D8 — transfer a membership to another cohort (history preserved). Invalidates
 * BOTH cohorts' membership lists (via memberships.all), the moved membership, and
 * the destination cohort's + membership's event streams.
 */
export function useTransferMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, toCohortId, ...opts }: TransferMembershipDto) =>
      CohortService.transferMembership(membershipId, toCohortId, opts),
    onSuccess: (updated, variables) => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.detail(updated.id) });
      // updated.cohort_id is the destination; memberships.all covers the source list too.
      queryClient.invalidateQueries({
        queryKey: cohortKeys.memberships.list(updated.cohort_id),
      });
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.all });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.events({ membershipId: updated.id }),
      });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.events({ cohortId: variables.toCohortId }),
      });
    },
  });
}

/**
 * D7 — close a cohort round (container → completed/archived) and auto-wrap-up its
 * members. Invalidates the cohort, its membership list, and its event stream.
 */
export function useCloseCohort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cohortId, ...opts }: CloseCohortDto) =>
      CohortService.closeCohort(cohortId, opts),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.detail(variables.cohortId) });
      queryClient.invalidateQueries({ queryKey: cohortKeys.cohorts.all });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.memberships.list(variables.cohortId),
      });
      queryClient.invalidateQueries({ queryKey: cohortKeys.memberships.all });
      queryClient.invalidateQueries({
        queryKey: cohortKeys.events({ cohortId: variables.cohortId }),
      });
    },
  });
}

// ── Status events ─────────────────────────────────────────────────────────────

export function useCohortStatusEvents(params: {
  cohortId?: string;
  membershipId?: string;
}) {
  return useQuery({
    queryKey: cohortKeys.events(params),
    queryFn: () => CohortService.getStatusEvents(params),
    enabled: !!(params.cohortId || params.membershipId),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useRecordStatusEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RecordStatusEventDto) => CohortService.recordStatusEvent(dto),
    onSuccess: (_data, dto) => {
      queryClient.invalidateQueries({
        queryKey: cohortKeys.events({
          cohortId: dto.cohort_id ?? undefined,
          membershipId: dto.membership_id ?? undefined,
        }),
      });
    },
  });
}
