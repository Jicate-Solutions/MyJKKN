'use client';

/**
 * Solutions Hub - Content Hooks
 * Purpose: React Query hooks for content orders and deliverables
 * Connected to: content-service.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  contentService,
  type ContentOrderFilters,
  type DeliverableFilters,
  type CreateContentOrderInput,
  type UpdateContentOrderInput,
  type CreateDeliverableInput,
  type UpdateDeliverableInput,
  type ContentOrderType,
  type ContentDivision,
  type DeliverableStatus,
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
    queryFn: () => contentService.getOrders(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single content order by ID
 */
export function useContentOrder(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.detail(id),
    queryFn: () => contentService.getOrderById(id),
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
    queryFn: () => contentService.getOrderBySolutionId(solutionId),
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
    queryFn: () => contentService.getOrdersByDivision(division),
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
    queryFn: () => contentService.getOrderStats(),
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
      contentService.createOrder(input),
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
      contentService.updateOrder(id, input),
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
    mutationFn: (id: string) => contentService.deleteOrder(id),
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
    queryFn: () => contentService.getDeliverables(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single deliverable by ID
 */
export function useDeliverable(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentDeliverables.detail(id),
    queryFn: () => contentService.getDeliverableById(id),
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
    queryFn: () => contentService.getDeliverablesByOrderId(orderId),
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
      contentService.createDeliverable(input),
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
      contentService.updateDeliverable(id, input),
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
    mutationFn: (id: string) => contentService.deleteDeliverable(id),
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
      contentService.submitForReview(id, fileUrl, fileType),
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
      contentService.requestRevision(id, notes),
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
      contentService.approveDeliverable(id, approvedBy),
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
      contentService.rejectDeliverable(id, notes),
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
    queryFn: () => contentService.getDeliverableStats(orderId),
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
      contentService.updateDeliverable(id, { status: 'approved' as DeliverableStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}
