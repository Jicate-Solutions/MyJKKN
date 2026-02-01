// hooks/parent-portal/use-parent-learners.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ParentPortalService } from '@/lib/services/parent-portal/parent-portal-service';
import type { LinkLearnerDto } from '@/types/parent-portal';
import { parentProfileKeys } from './use-parent-profile';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const parentLearnerKeys = {
  all: ['parent-learners'] as const,
  lists: () => [...parentLearnerKeys.all, 'list'] as const,
  byParent: (parentId: string) => [...parentLearnerKeys.lists(), parentId] as const,
  attendance: (learnerId: string) => [...parentLearnerKeys.all, 'attendance', learnerId] as const,
  fees: (learnerId: string) => [...parentLearnerKeys.all, 'fees', learnerId] as const,
};

// ============================================================================
// QUERY HOOKS
// ============================================================================

export function useLinkedLearners(parentId: string) {
  return useQuery({
    queryKey: parentLearnerKeys.byParent(parentId),
    queryFn: () => ParentPortalService.getLinkedLearners(parentId),
    enabled: !!parentId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLearnerAttendance(learnerId: string) {
  return useQuery({
    queryKey: parentLearnerKeys.attendance(learnerId),
    queryFn: () => ParentPortalService.getLearnerAttendance(learnerId),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLearnerFees(learnerId: string) {
  return useQuery({
    queryKey: parentLearnerKeys.fees(learnerId),
    queryFn: () => ParentPortalService.getLearnerFees(learnerId),
    enabled: !!learnerId,
    staleTime: 2 * 60 * 1000, // More frequent updates for fees
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useLinkLearner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LinkLearnerDto) => ParentPortalService.linkLearner(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: parentLearnerKeys.byParent(variables.parent_id),
      });
      queryClient.invalidateQueries({ queryKey: parentProfileKeys.lists() });
      toast.success('Learner linked successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to link learner');
    },
  });
}

export function useUnlinkLearner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ linkId, parentId }: { linkId: string; parentId: string }) =>
      ParentPortalService.unlinkLearner(linkId).then(() => parentId),
    onSuccess: (parentId) => {
      queryClient.invalidateQueries({
        queryKey: parentLearnerKeys.byParent(parentId),
      });
      toast.success('Learner unlinked successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unlink learner');
    },
  });
}

export function useVerifyLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      linkId,
      verifiedBy,
      parentId,
    }: {
      linkId: string;
      verifiedBy: string;
      parentId: string;
    }) =>
      ParentPortalService.verifyLink(linkId, verifiedBy).then(() => parentId),
    onSuccess: (parentId) => {
      queryClient.invalidateQueries({
        queryKey: parentLearnerKeys.byParent(parentId),
      });
      toast.success('Link verified successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to verify link');
    },
  });
}

export function useSetPrimaryLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ linkId, parentId }: { linkId: string; parentId: string }) =>
      ParentPortalService.setPrimaryLink(linkId).then(() => parentId),
    onSuccess: (parentId) => {
      queryClient.invalidateQueries({
        queryKey: parentLearnerKeys.byParent(parentId),
      });
      toast.success('Primary parent updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update primary parent');
    },
  });
}
