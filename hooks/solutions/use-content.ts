'use client';

/**
 * Solutions Hub - Content Hooks
 * Purpose: React Query hooks for content orders and deliverables
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-content-orders.ts & use-content-deliverables.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type ContentOrderType =
  | 'video'
  | 'graphic'
  | 'document'
  | 'presentation'
  | 'animation'
  | 'social_media'
  | 'other';

export type ContentDivision =
  | 'video'
  | 'design'
  | 'writing'
  | 'animation'
  | 'social'
  | 'other';

export type DeliverableStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'revision'
  | 'approved'
  | 'delivered';

export interface ContentOrderFilters {
  solution_id?: string;
  order_type?: ContentOrderType;
  division?: ContentDivision;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateContentOrderInput {
  solution_id: string;
  title: string;
  order_type: ContentOrderType;
  division: ContentDivision;
  quantity?: number;
  revision_rounds?: number;
  due_date?: string;
  notes?: string;
}

export interface UpdateContentOrderInput {
  title?: string;
  order_type?: ContentOrderType;
  division?: ContentDivision;
  quantity?: number;
  revision_rounds?: number;
  due_date?: string;
  status?: string;
  notes?: string;
}

export interface DeliverableFilters {
  order_id?: string;
  status?: DeliverableStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateDeliverableInput {
  order_id: string;
  title: string;
}

export interface UpdateDeliverableInput {
  title?: string;
  file_url?: string;
  status?: DeliverableStatus;
  notes?: string;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentService = any;

const contentService: ContentService = {
  // Content Orders
  getContentOrders: async (_filters?: ContentOrderFilters) => {
    throw new Error('contentService.getContentOrders not implemented');
  },
  getContentOrderById: async (_id: string) => {
    throw new Error('contentService.getContentOrderById not implemented');
  },
  getContentOrderBySolutionId: async (_solutionId: string) => {
    throw new Error('contentService.getContentOrderBySolutionId not implemented');
  },
  createContentOrder: async (_input: CreateContentOrderInput) => {
    throw new Error('contentService.createContentOrder not implemented');
  },
  updateContentOrder: async (_id: string, _input: UpdateContentOrderInput) => {
    throw new Error('contentService.updateContentOrder not implemented');
  },
  deleteContentOrder: async (_id: string) => {
    throw new Error('contentService.deleteContentOrder not implemented');
  },
  getOrdersByDivision: async (_division: ContentDivision) => {
    throw new Error('contentService.getOrdersByDivision not implemented');
  },
  getContentOrderStats: async () => {
    throw new Error('contentService.getContentOrderStats not implemented');
  },

  // Content Deliverables
  getDeliverables: async (_filters?: DeliverableFilters) => {
    throw new Error('contentService.getDeliverables not implemented');
  },
  getDeliverableById: async (_id: string) => {
    throw new Error('contentService.getDeliverableById not implemented');
  },
  getDeliverablesByOrder: async (_orderId: string) => {
    throw new Error('contentService.getDeliverablesByOrder not implemented');
  },
  createDeliverable: async (_input: CreateDeliverableInput) => {
    throw new Error('contentService.createDeliverable not implemented');
  },
  updateDeliverable: async (_id: string, _input: UpdateDeliverableInput) => {
    throw new Error('contentService.updateDeliverable not implemented');
  },
  deleteDeliverable: async (_id: string) => {
    throw new Error('contentService.deleteDeliverable not implemented');
  },
  submitForReview: async (_id: string, _fileUrl: string) => {
    throw new Error('contentService.submitForReview not implemented');
  },
  requestRevision: async (_id: string, _notes: string) => {
    throw new Error('contentService.requestRevision not implemented');
  },
  approveDeliverable: async (_id: string) => {
    throw new Error('contentService.approveDeliverable not implemented');
  },
  markDelivered: async (_id: string) => {
    throw new Error('contentService.markDelivered not implemented');
  },
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
    queryFn: () => contentService.getContentOrders(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single content order by ID
 */
export function useContentOrder(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.contentOrders.detail(id),
    queryFn: () => contentService.getContentOrderById(id),
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
    queryFn: () => contentService.getContentOrderBySolutionId(solutionId),
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
    queryFn: () => contentService.getContentOrderStats(),
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
      contentService.createContentOrder(input),
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
      contentService.updateContentOrder(id, input),
    onSuccess: (data) => {
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
    mutationFn: (id: string) => contentService.deleteContentOrder(id),
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
    queryFn: () => contentService.getDeliverablesByOrder(orderId),
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
    onSuccess: (data) => {
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
    onSuccess: (data) => {
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
    mutationFn: ({ id, fileUrl }: { id: string; fileUrl: string }) =>
      contentService.submitForReview(id, fileUrl),
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
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
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
    mutationFn: (id: string) => contentService.approveDeliverable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Mark deliverable as delivered
 */
export function useMarkDelivered() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contentService.markDelivered(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}
