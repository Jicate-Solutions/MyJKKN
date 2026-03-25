// hooks/learner-profile/use-change-request.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { ProfileChangeRequest, ChangeRequestFilters } from '@/types/learner-profile-change';

/**
 * Fetch single change request by ID
 */
export function useChangeRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['change-request', requestId],
    queryFn: async () => {
      if (!requestId) throw new Error('Request ID is required');

      const res = await fetch(`/api/learner-profile/change-requests/${requestId}`);
      if (!res.ok) throw new Error('Failed to fetch change request');

      const data = await res.json();
      return data as ProfileChangeRequest;
    },
    enabled: !!requestId,
    staleTime: 30_000, // 30 seconds
  });
}

/**
 * Fetch pending change request for a learner
 */
export function usePendingChangeRequest(learnerId: string | undefined) {
  return useQuery({
    queryKey: ['change-request', 'pending', learnerId],
    queryFn: async () => {
      if (!learnerId) throw new Error('Learner ID is required');

      const res = await fetch(`/api/learner-profile/change-requests/pending/${learnerId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 404) return null; // No pending request
        throw new Error('Failed to fetch pending request');
      }

      const data = await res.json();
      return data as ProfileChangeRequest | null;
    },
    enabled: !!learnerId,
    staleTime: 30_000,
  });
}

/**
 * Fetch list of pending change requests (for approvers)
 */
export function usePendingRequests(filters: ChangeRequestFilters = {}) {
  return useQuery({
    queryKey: ['change-requests', 'list', filters],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (filters.status) params.set('status', filters.status);
      if (filters.institution_id) params.set('institution_id', filters.institution_id);
      if (filters.department_id) params.set('department_id', filters.department_id);
      if (filters.page) params.set('page', filters.page.toString());
      if (filters.limit) params.set('limit', filters.limit.toString());

      const res = await fetch(`/api/learner-profile/change-requests?${params}`);
      if (!res.ok) throw new Error('Failed to fetch change requests');

      const data = await res.json();
      return data as { data: ProfileChangeRequest[]; total: number };
    },
    staleTime: 30_000,
  });
}
