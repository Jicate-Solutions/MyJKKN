'use client';

/**
 * Solutions Hub - Content Hooks
 * Purpose: React Query hooks for content orders and deliverables
 * Connected to: content-service.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  ContentOrderFilters,
  DeliverableFilters,
  CreateContentOrderInput,
  UpdateContentOrderInput,
  CreateDeliverableInput,
  UpdateDeliverableInput,
  ContentOrderType,
  ContentDivision,
  DeliverableStatus,
} from '@/lib/services/solutions';

// ============================================
// TYPES (re-export from service types)
// ============================================

export type {
  ContentOrderType,
  ContentDivision,
  DeliverableStatus,
  ContentOrderFilters,
  CreateContentOrderInput,
  UpdateContentOrderInput,
  DeliverableFilters,
  CreateDeliverableInput,
  UpdateDeliverableInput,
};

// ============================================
// QUERY HOOKS - CONTENT ORDERS
// ============================================

/**
 * Fetch all content orders with optional filters
 */
export function useContentOrders(filters?: ContentOrderFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.list(filters),
    queryFn: () => apiClient.get('/api/solutions/content/orders', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single content order by ID
 */
export function useContentOrder(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/content/orders/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch content order by solution ID
 */
export function useContentOrderBySolution(solutionId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.bySolution(solutionId),
    queryFn: () => apiClient.get('/api/solutions/content/orders', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch orders by division
 */
export function useOrdersByDivision(division: ContentDivision) {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.byDivision(division),
    queryFn: () => apiClient.get('/api/solutions/content/orders', { params: { division } }),
    enabled: !!division,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch content order statistics
 */
export function useContentOrderStats() {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.stats(),
    queryFn: () => apiClient.get('/api/solutions/content/orders', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// MUTATION HOOKS - CONTENT ORDERS
// ============================================

/**
 * Create a new content order
 */
export function useCreateContentOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateContentOrderInput) =>
      apiClient.post('/api/solutions/content/orders', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentOrders.all });
    },
  });
}

/**
 * Update an existing content order
 */
export function useUpdateContentOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContentOrderInput }) =>
      apiClient.patch<{ id?: string }>(`/api/solutions/content/orders/${id}`, input),
    onSuccess: (data: { id?: string }) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentOrders.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.contentOrders.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a content order
 */
export function useDeleteContentOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/content/orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentOrders.all });
    },
  });
}

// ============================================
// QUERY HOOKS - DELIVERABLES
// ============================================

/**
 * Fetch all deliverables with optional filters
 */
export function useDeliverables(filters?: DeliverableFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.contentDeliverables.list(filters),
    queryFn: () => apiClient.get('/api/solutions/content/deliverables', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single deliverable by ID
 */
export function useDeliverable(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentDeliverables.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/content/deliverables/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch deliverables by order ID
 */
export function useDeliverablesByOrder(orderId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentDeliverables.byOrder(orderId),
    queryFn: () => apiClient.get('/api/solutions/content/deliverables', { params: { order_id: orderId } }),
    enabled: !!orderId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS - DELIVERABLES
// ============================================

/**
 * Create a new deliverable
 */
export function useCreateDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateDeliverableInput) =>
      apiClient.post<{ order_id?: string }>('/api/solutions/content/deliverables', input),
    onSuccess: (data: { order_id?: string }) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
      if (data?.order_id) {
        queryClient.invalidateQueries({
          queryKey: solutionsHubKeys.contentDeliverables.byOrder(data.order_id),
        });
      }
    },
  });
}

/**
 * Update an existing deliverable
 */
export function useUpdateDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDeliverableInput }) =>
      apiClient.patch<{ id?: string }>(`/api/solutions/content/deliverables/${id}`, input),
    onSuccess: (data: { id?: string }) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
      if (data?.id) {
        queryClient.setQueryData(solutionsHubKeys.contentDeliverables.detail(data.id), data);
      }
    },
  });
}

/**
 * Delete a deliverable
 */
export function useDeleteDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/content/deliverables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Submit deliverable for review
 */
export function useSubmitForReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, fileUrl, fileType }: { id: string; fileUrl: string; fileType?: string }) =>
      apiClient.post(`/api/solutions/content/deliverables/${id}/submit`, { file_url: fileUrl, file_type: fileType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Request revision on a deliverable
 */
export function useRequestRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiClient.post(`/api/solutions/content/deliverables/${id}/reject`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Approve a deliverable
 */
export function useApproveDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, approvedBy }: { id: string; approvedBy: string }) =>
      apiClient.post(`/api/solutions/content/deliverables/${id}/approve`, { approved_by: approvedBy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Reject a deliverable
 */
export function useRejectDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiClient.post(`/api/solutions/content/deliverables/${id}/reject`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Get deliverable statistics
 */
export function useDeliverableStats(orderId?: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.contentDeliverables.all, 'stats', orderId],
    queryFn: () => apiClient.get('/api/solutions/content/deliverables', { params: { order_id: orderId, stats: 'true' } }),
    enabled: !!orderId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Mark deliverable as delivered (alias for updateDeliverable with status)
 * @deprecated Use useUpdateDeliverable with status: 'approved' instead
 */
export function useMarkDelivered() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/api/solutions/content/deliverables/${id}`, { status: 'approved' as DeliverableStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}
