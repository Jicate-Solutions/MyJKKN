// hooks/learner-profile/use-change-request-mutations.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CreateChangeRequestDto,
  ApproveRequestDto,
  RejectRequestDto,
  ProfileChangeRequest,
} from '@/types/learner-profile-change';

/**
 * Create change request mutation
 */
export function useCreateChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateChangeRequestDto) => {
      const res = await fetch('/api/learner-profile/change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create change request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onSuccess: (data) => {
      toast.success('Change request submitted successfully!');

      // Directly set the pending request data in cache so the UI updates immediately
      // (invalidateQueries only triggers a background refetch which may return stale/cached data)
      queryClient.setQueryData(['change-request', 'pending', data.learner_id], data);

      // Also invalidate to ensure eventual consistency
      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
      queryClient.invalidateQueries({ queryKey: ['learner-profile', data.learner_id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit change request');
    },
  });
}

/**
 * Approve change request mutation
 */
export function useApproveChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, dto }: { requestId: string; dto: ApproveRequestDto }) => {
      const res = await fetch(`/api/learner-profile/change-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to approve request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onMutate: async ({ requestId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['change-requests'] });

      // Snapshot previous value
      const previousRequests = queryClient.getQueryData(['change-requests', 'list']);

      // Optimistically remove from list
      queryClient.setQueryData(['change-requests', 'list'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((r: ProfileChangeRequest) => r.id !== requestId),
          total: old.total - 1,
        };
      });

      return { previousRequests };
    },
    onSuccess: (data) => {
      toast.success(`Profile updated for ${data.learner?.first_name} ${data.learner?.last_name}`);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['learner-profile', data.learner_id] });
      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
    },
    onError: (error: Error, variables, context) => {
      // Rollback optimistic update
      if (context?.previousRequests) {
        queryClient.setQueryData(['change-requests', 'list'], context.previousRequests);
      }
      toast.error(error.message || 'Failed to approve request');
    },
  });
}

/**
 * Reject change request mutation
 */
export function useRejectChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, dto }: { requestId: string; dto: RejectRequestDto }) => {
      const res = await fetch(`/api/learner-profile/change-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dto),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to reject request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onMutate: async ({ requestId }) => {
      await queryClient.cancelQueries({ queryKey: ['change-requests'] });

      const previousRequests = queryClient.getQueryData(['change-requests', 'list']);

      queryClient.setQueryData(['change-requests', 'list'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((r: ProfileChangeRequest) => r.id !== requestId),
          total: old.total - 1,
        };
      });

      return { previousRequests };
    },
    onSuccess: (data) => {
      toast.success('Request rejected with feedback');

      queryClient.invalidateQueries({ queryKey: ['change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
    },
    onError: (error: Error, variables, context) => {
      if (context?.previousRequests) {
        queryClient.setQueryData(['change-requests', 'list'], context.previousRequests);
      }
      toast.error(error.message || 'Failed to reject request');
    },
  });
}

/**
 * Cancel change request mutation (student action)
 */
export function useCancelChangeRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const res = await fetch(`/api/learner-profile/change-requests/${requestId}/cancel`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to cancel request');
      }

      return res.json() as Promise<ProfileChangeRequest>;
    },
    onSuccess: (data) => {
      toast.success('Change request cancelled');

      queryClient.invalidateQueries({ queryKey: ['change-request', 'pending', data.learner_id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel request');
    },
  });
}
