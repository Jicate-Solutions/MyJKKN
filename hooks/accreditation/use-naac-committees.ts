// hooks/accreditation/use-naac-committees.ts
// ============================================================================
// React Query hooks for NAAC IQAC committee CRUD (PR-A8 c2).
//
// Body-hard-coded to 'NAAC' for this PR. PR-A9 (NIRF), A10 (NBA) etc. will
// introduce use-<body>-committees.ts that call the same service with their
// body_code — or we add a useBodyCommittees(bodyCode) generic here. Keeping
// it NAAC-specific for now per Director-locked body-agnostic mandate —
// callers pass body_code, not hard-coded at the service layer.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AccreditationCommitteeService,
  type CreateCommitteePayload,
  type UpdateCommitteePayload,
  type AddInternalMemberPayload,
  type AddExternalMemberPayload,
} from '@/lib/services/accreditation/accreditation-committee-service';

// Keys — scoped to body_code + institutionId for precise invalidation
export const naacCommitteeKeys = {
  all: ['accreditation', 'committees', 'NAAC'] as const,
  lists: () => [...naacCommitteeKeys.all, 'list'] as const,
  list: (institutionId: string | 'all', includeInactive = false) =>
    [...naacCommitteeKeys.lists(), institutionId, includeInactive] as const,
  detail: (id: string) => [...naacCommitteeKeys.all, 'detail', id] as const,
  members: (committeeId: string, includeInactive = false) =>
    [...naacCommitteeKeys.all, 'members', committeeId, includeInactive] as const,
};

/**
 * List NAAC committees scoped to an institution (or 'all' for super_admin).
 * Returns committees + member_count in one shape.
 */
export function useNAACCommittees(
  institutionId: string | 'all',
  options?: { includeInactive?: boolean },
) {
  const includeInactive = options?.includeInactive ?? false;
  return useQuery({
    queryKey: naacCommitteeKeys.list(institutionId, includeInactive),
    queryFn: () =>
      AccreditationCommitteeService.listWithMemberCounts({
        bodyCode: 'NAAC',
        institutionId: institutionId === 'all' ? undefined : institutionId,
        includeInactive,
      }),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useNAACCommittee(id: string | undefined) {
  return useQuery({
    queryKey: id ? naacCommitteeKeys.detail(id) : ['accreditation', 'committees', 'NAAC', 'detail', 'none'],
    queryFn: () => AccreditationCommitteeService.getById(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useNAACCommitteeMembers(
  committeeId: string | undefined,
  options?: { includeInactive?: boolean },
) {
  const includeInactive = options?.includeInactive ?? false;
  return useQuery({
    queryKey: committeeId
      ? naacCommitteeKeys.members(committeeId, includeInactive)
      : ['accreditation', 'committees', 'NAAC', 'members', 'none'],
    queryFn: () => AccreditationCommitteeService.listMembers(committeeId!, includeInactive),
    enabled: !!committeeId,
    staleTime: 2 * 60 * 1000,
  });
}

// -------------------- Mutations --------------------

export function useCreateNAACCommittee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCommitteePayload) =>
      AccreditationCommitteeService.create({ ...payload, body_code: 'NAAC' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.lists() });
    },
  });
}

export function useUpdateNAACCommittee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCommitteePayload }) =>
      AccreditationCommitteeService.update(id, payload),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.lists() });
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.detail(variables.id) });
    },
  });
}

export function useDeactivateNAACCommittee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AccreditationCommitteeService.deactivate(id),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.lists() });
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.detail(id) });
    },
  });
}

export function useAddInternalMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddInternalMemberPayload) =>
      AccreditationCommitteeService.addInternalMember(payload),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacCommitteeKeys.members(variables.committee_id),
      });
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.lists() });
    },
  });
}

export function useAddExternalMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AddExternalMemberPayload) =>
      AccreditationCommitteeService.addExternalMember(payload),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacCommitteeKeys.members(variables.committee_id),
      });
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.lists() });
    },
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, committeeId }: { memberId: string; committeeId: string }) =>
      AccreditationCommitteeService.removeMember(memberId),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({
        queryKey: naacCommitteeKeys.members(variables.committeeId),
      });
      qc.invalidateQueries({ queryKey: naacCommitteeKeys.lists() });
    },
  });
}
