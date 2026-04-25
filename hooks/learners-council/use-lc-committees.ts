'use client';

// hooks/learners-council/use-lc-committees.ts
// Learners Council - Portfolio Committee React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCCommitteeService } from '@/lib/services/learners-council/committee-service';
import type {
  CreateCommitteeDto,
  UpdateCommitteeDto,
  AssignCommitteeMemberDto
} from '@/types/learners-council';

// ============================================================================
// QUERY KEY FACTORIES
// ============================================================================

export const lcCommitteeKeys = {
  all: ['lc-committees'] as const,
  lists: () => ['lc-committees', 'list'] as const,
  list: (filters: Record<string, unknown>) => ['lc-committees', 'list', filters] as const,
  details: () => ['lc-committees', 'detail'] as const,
  detail: (id: string) => ['lc-committees', 'detail', id] as const,
  members: (committeeId: string) => ['lc-committees', 'members', committeeId] as const
};

// ============================================================================
// COMMITTEE QUERIES
// ============================================================================

/**
 * Fetch committees with optional filters.
 */
export function useCommittees(filters?: { term_id?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: filters
      ? lcCommitteeKeys.list(filters as Record<string, unknown>)
      : lcCommitteeKeys.lists(),
    queryFn: () => LCCommitteeService.getCommittees(filters),
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Fetch a single committee by ID with members joined.
 */
export function useCommittee(id: string) {
  return useQuery({
    queryKey: lcCommitteeKeys.detail(id),
    queryFn: () => LCCommitteeService.getCommitteeById(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000
  });
}

// ============================================================================
// COMMITTEE MUTATIONS
// ============================================================================

/**
 * Create a new committee.
 */
export function useCreateCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommitteeDto) => LCCommitteeService.createCommittee(data),
    onSuccess: () => {
      toast.success('Committee created successfully');
      queryClient.invalidateQueries({ queryKey: lcCommitteeKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create committee');
    }
  });
}

/**
 * Update an existing committee.
 */
export function useUpdateCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCommitteeDto }) =>
      LCCommitteeService.updateCommittee(id, data),
    onSuccess: (committee) => {
      toast.success('Committee updated successfully');
      queryClient.invalidateQueries({ queryKey: lcCommitteeKeys.all });
      queryClient.invalidateQueries({ queryKey: lcCommitteeKeys.detail(committee.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update committee');
    }
  });
}

/**
 * Delete a committee (soft delete if it has active members, else hard delete).
 */
export function useDeleteCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => LCCommitteeService.deleteCommittee(id),
    onSuccess: () => {
      toast.success('Committee deleted');
      queryClient.invalidateQueries({ queryKey: lcCommitteeKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete committee');
    }
  });
}

// ============================================================================
// COMMITTEE MEMBER HOOKS
// ============================================================================

/**
 * Fetch active members for a committee.
 */
export function useCommitteeMembers(committeeId: string) {
  return useQuery({
    queryKey: lcCommitteeKeys.members(committeeId),
    queryFn: () => LCCommitteeService.getCommitteeMembers(committeeId),
    enabled: !!committeeId,
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Assign an lc_member to a committee.
 */
export function useAssignCommitteeMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AssignCommitteeMemberDto) => LCCommitteeService.assignMember(data),
    onSuccess: (_, variables) => {
      toast.success('Member assigned to committee');
      queryClient.invalidateQueries({
        queryKey: lcCommitteeKeys.members(variables.committee_id)
      });
      queryClient.invalidateQueries({
        queryKey: lcCommitteeKeys.detail(variables.committee_id)
      });
      queryClient.invalidateQueries({ queryKey: lcCommitteeKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign committee member');
    }
  });
}

/**
 * Remove a member from a committee (hard delete junction row).
 */
export function useRemoveCommitteeMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, committeeId: _committeeId }: { id: string; committeeId: string }) =>
      LCCommitteeService.removeMember(id),
    onSuccess: (_, variables) => {
      toast.success('Member removed from committee');
      queryClient.invalidateQueries({
        queryKey: lcCommitteeKeys.members(variables.committeeId)
      });
      queryClient.invalidateQueries({
        queryKey: lcCommitteeKeys.detail(variables.committeeId)
      });
      queryClient.invalidateQueries({ queryKey: lcCommitteeKeys.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove committee member');
    }
  });
}

/**
 * Update a committee member's role.
 */
export function useUpdateCommitteeMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      role,
      committeeId: _committeeId
    }: {
      id: string;
      role: 'chair' | 'co_chair' | 'member';
      committeeId: string;
    }) => LCCommitteeService.updateMemberRole(id, role),
    onSuccess: (_, variables) => {
      toast.success('Member role updated');
      queryClient.invalidateQueries({
        queryKey: lcCommitteeKeys.members(variables.committeeId)
      });
      queryClient.invalidateQueries({
        queryKey: lcCommitteeKeys.detail(variables.committeeId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update member role');
    }
  });
}
