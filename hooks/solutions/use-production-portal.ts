'use client';

/**
 * Solutions Hub - Production Portal Hooks
 * Purpose: React Query hooks for production learner portal (talent-facing)
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-production-portal.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { ContentDivision } from './use-content';

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductionPortalService = any;

const productionPortalService: ProductionPortalService = {
  getLearnerByUserId: async (_userId: string) => {
    throw new Error('productionPortalService.getLearnerByUserId not implemented');
  },
  getMyStats: async (_learnerId: string) => {
    throw new Error('productionPortalService.getMyStats not implemented');
  },
  getAvailableWork: async (_learnerId: string, _division?: ContentDivision) => {
    throw new Error('productionPortalService.getAvailableWork not implemented');
  },
  getAllAvailableWork: async () => {
    throw new Error('productionPortalService.getAllAvailableWork not implemented');
  },
  claimDeliverable: async (_deliverableId: string, _learnerId: string) => {
    throw new Error('productionPortalService.claimDeliverable not implemented');
  },
  getMyWork: async (_learnerId: string) => {
    throw new Error('productionPortalService.getMyWork not implemented');
  },
  getMyActiveWork: async (_learnerId: string) => {
    throw new Error('productionPortalService.getMyActiveWork not implemented');
  },
  submitWork: async (_deliverableId: string, _fileUrl: string, _fileType?: string) => {
    throw new Error('productionPortalService.submitWork not implemented');
  },
  getMyEarnings: async (_learnerId: string) => {
    throw new Error('productionPortalService.getMyEarnings not implemented');
  },
  getDeliverableForSubmission: async (_deliverableId: string, _learnerId: string) => {
    throw new Error('productionPortalService.getDeliverableForSubmission not implemented');
  },
};

// ============================================
// QUERY HOOKS - PROFILE
// ============================================

/**
 * Get production learner by user ID (for logged-in user)
 */
export function useLearnerByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.learner(userId || ''),
    queryFn: () => productionPortalService.getLearnerByUserId(userId!),
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

/**
 * Get portal statistics for learner
 */
export function useMyStats(learnerId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.stats(learnerId || ''),
    queryFn: () => productionPortalService.getMyStats(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// QUERY HOOKS - AVAILABLE WORK
// ============================================

/**
 * Get available work for a division
 */
export function useAvailableWork(
  learnerId: string | undefined,
  division?: ContentDivision
) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.availableWork(learnerId || '', division),
    queryFn: () => productionPortalService.getAvailableWork(learnerId!, division),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get all available work across divisions
 */
export function useAllAvailableWork() {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.allAvailableWork(),
    queryFn: () => productionPortalService.getAllAvailableWork(),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// QUERY HOOKS - MY WORK
// ============================================

/**
 * Get my work (all assignments)
 */
export function useMyWork(learnerId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.myWork(learnerId || ''),
    queryFn: () => productionPortalService.getMyWork(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get my active work (not completed)
 */
export function useMyActiveWork(learnerId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.myActiveWork(learnerId || ''),
    queryFn: () => productionPortalService.getMyActiveWork(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// QUERY HOOKS - EARNINGS
// ============================================

/**
 * Get my earnings
 */
export function useMyProductionEarnings(learnerId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.earnings(learnerId || ''),
    queryFn: () => productionPortalService.getMyEarnings(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - SUBMISSION
// ============================================

/**
 * Get deliverable for submission
 */
export function useDeliverableForSubmission(
  deliverableId: string,
  learnerId: string | undefined
) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.submission(deliverableId, learnerId || ''),
    queryFn: () =>
      productionPortalService.getDeliverableForSubmission(deliverableId, learnerId!),
    enabled: !!deliverableId && !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Claim a deliverable
 */
export function useClaimWork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deliverableId,
      learnerId,
    }: {
      deliverableId: string;
      learnerId: string;
    }) => productionPortalService.claimDeliverable(deliverableId, learnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Submit work
 */
export function useSubmitWork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deliverableId,
      fileUrl,
      fileType,
    }: {
      deliverableId: string;
      fileUrl: string;
      fileType?: string;
    }) => productionPortalService.submitWork(deliverableId, fileUrl, fileType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}
