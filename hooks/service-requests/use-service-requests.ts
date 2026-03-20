/**
 * Service Requests React Query Hooks
 *
 * Provides hooks for:
 * - Listing/filtering service requests
 * - Creating, updating, submitting requests
 * - Approval workflow (approve, reject, return)
 * - Timeline (comments, internal notes)
 * - Analytics and counts
 *
 * @module hooks/service-requests/use-service-requests
 * @created 2026-02-09
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type {
  ServiceRequest,
  ServiceRequestListResponse,
  ServiceRequestFilters,
  CreateServiceRequestDto,
  UpdateServiceRequestDto,
  ProcessApprovalDto,
  ServiceRequestAnalytics,
  ServiceRequestApproval,
} from '@/types/service-request';

// =====================================================
// QUERY KEYS
// =====================================================

export const serviceRequestKeys = {
  all: ['service-requests'] as const,
  lists: () => [...serviceRequestKeys.all, 'list'] as const,
  list: (filters: any) => [...serviceRequestKeys.lists(), filters] as const,
  myRequests: (filters?: any) => [...serviceRequestKeys.all, 'my', filters] as const,
  details: () => [...serviceRequestKeys.all, 'detail'] as const,
  detail: (id: string) => [...serviceRequestKeys.details(), id] as const,
  pendingApprovals: (filters?: any) => [...serviceRequestKeys.all, 'pending-approvals', filters] as const,
  pendingCount: () => [...serviceRequestKeys.all, 'pending-count'] as const,
  analytics: (filters?: any) => [...serviceRequestKeys.all, 'analytics', filters] as const,
  countsByStatus: (filters?: any) => [...serviceRequestKeys.all, 'counts', filters] as const,
};

// =====================================================
// QUERY HOOKS
// =====================================================

/**
 * Fetch all service requests (admin view) with filters and pagination
 */
export function useServiceRequests(filters?: ServiceRequestFilters) {
  return useQuery<ServiceRequestListResponse>({
    queryKey: serviceRequestKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
              params.set(key, value.join(','));
            } else {
              params.set(key, String(value));
            }
          }
        });
      }
      const res = await fetch(`/api/service-requests?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch service requests');
      }
      return res.json();
    },
  });
}

/**
 * Fetch current user's own service requests
 */
export function useMyServiceRequests(filters?: Partial<ServiceRequestFilters>) {
  return useQuery<ServiceRequestListResponse>({
    queryKey: serviceRequestKeys.myRequests(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
              params.set(key, value.join(','));
            } else {
              params.set(key, String(value));
            }
          }
        });
      }
      const res = await fetch(`/api/service-requests/my?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch your requests');
      }
      return res.json();
    },
  });
}

/**
 * Fetch a single service request with full details
 */
export function useServiceRequest(id: string) {
  return useQuery<ServiceRequest>({
    queryKey: serviceRequestKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/service-requests/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch service request');
      }
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Fetch pending approvals for the current user
 */
export function usePendingApprovals(filters?: { service_type_id?: string; page?: number; limit?: number }) {
  return useQuery<{ data: ServiceRequestApproval[]; metadata: { total: number } }>({
    queryKey: serviceRequestKeys.pendingApprovals(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.set(key, String(value));
          }
        });
      }
      const res = await fetch(`/api/service-requests/approvals?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch pending approvals');
      }
      return res.json();
    },
    refetchInterval: 30000,
  });
}

/**
 * Fetch count of pending approvals for the current user
 */
export function usePendingApprovalCount() {
  return useQuery<{ count: number }>({
    queryKey: serviceRequestKeys.pendingCount(),
    queryFn: async () => {
      const res = await fetch('/api/service-requests/approvals/count');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch pending count');
      }
      return res.json();
    },
    refetchInterval: 60000,
  });
}

/**
 * Fetch service request analytics
 */
export function useServiceRequestAnalytics(filters?: { institution_id?: string; from?: string; to?: string }) {
  return useQuery<ServiceRequestAnalytics>({
    queryKey: serviceRequestKeys.analytics(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.set(key, String(value));
          }
        });
      }
      const res = await fetch(`/api/service-requests/analytics?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch analytics');
      }
      return res.json();
    },
  });
}

/**
 * Fetch request counts grouped by status
 */
export function useRequestCountsByStatus(filters?: { institution_id?: string }) {
  return useQuery<Record<string, number>>({
    queryKey: serviceRequestKeys.countsByStatus(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('type', 'counts');
      if (filters?.institution_id) params.set('institution_id', filters.institution_id);
      const res = await fetch(`/api/service-requests/analytics?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch counts');
      }
      return res.json();
    },
  });
}

// =====================================================
// MUTATION HOOKS
// =====================================================

/**
 * Create a new service request
 */
export function useCreateServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateServiceRequestDto) => {
      const res = await fetch('/api/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create service request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
      toast.success('Service request created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Update a draft/returned service request
 */
export function useUpdateServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateServiceRequestDto }) => {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update service request');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.lists() });
      toast.success('Service request updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Submit a draft request for review
 */
export function useSubmitServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-requests/${id}/submit`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
      toast.success('Request submitted for review');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Cancel a service request
 */
export function useCancelServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const res = await fetch(`/api/service-requests/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to cancel request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
      toast.success('Request cancelled');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Process an approval action (approve, reject, or return)
 */
export function useProcessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProcessApprovalDto }) => {
      const res = await fetch(`/api/service-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to process approval');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.pendingApprovals() });
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.pendingCount() });
      const actionLabel =
        variables.data.action === 'approved' ? 'approved' :
        variables.data.action === 'rejected' ? 'rejected' : 'returned';
      toast.success(`Request ${actionLabel} successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Mark a request as fulfilled
 */
export function useMarkFulfilled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-requests/${id}/fulfill`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to mark as fulfilled');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
      toast.success('Request marked as fulfilled');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Close a request
 */
export function useCloseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-requests/${id}/close`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to close request');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.all });
      toast.success('Request closed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Add a comment to a request's timeline
 */
export function useAddComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`/api/service-requests/${id}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'comment', content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add comment');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.detail(variables.id) });
      toast.success('Comment added');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Add an internal note to a request's timeline (visible only to staff)
 */
export function useAddInternalNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`/api/service-requests/${id}/timeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'internal_note', content, is_internal: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to add internal note');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: serviceRequestKeys.detail(variables.id) });
      toast.success('Internal note added');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
