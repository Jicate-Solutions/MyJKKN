'use client';

/**
 * Solutions Hub - Production Portal Hooks
 * Purpose: React Query hooks for production learner portal (talent-facing)
 * Connected to: production-service.ts, content-service.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  productionService,
  contentService,
  type ContentDivision,
  type ProductionLearner,
  type ProductionLearnerFilters,
  type CreateProductionLearnerInput,
  type UpdateProductionLearnerInput,
  type SkillLevel,
} from '@/lib/services/solutions';

// Re-export types for consumers
export type {
  ContentDivision,
  ProductionLearnerFilters,
  CreateProductionLearnerInput,
  UpdateProductionLearnerInput,
  SkillLevel,
};

// ============================================
// QUERY HOOKS - PROFILE
// ============================================

/**
 * Get production learner by user ID (for logged-in user)
 * Note: This requires a custom query since getLearnerById expects learner ID, not user ID
 */
export function useLearnerByUserId(userId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.learner(userId || ''),
    queryFn: async () => {
      // Get all learners and filter by user_id
      const result = await productionService.getLearners({ status: 'active' });
      const learner = result.data.find((l) => l.user_id === userId);
      return learner || null;
    },
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

/**
 * Get production learner by ID
 */
export function useProductionLearner(learnerId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionLearners.detail(learnerId || ''),
    queryFn: () => productionService.getLearnerById(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Get all production learners with filters
 */
export function useProductionLearners(filters?: ProductionLearnerFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.productionLearners.list(filters),
    queryFn: () => productionService.getLearners(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get portal statistics for learner
 */
export function useMyStats(learnerId: string | undefined) {
  return useQuery({
    queryKey: solutionsHubKeys.productionPortal.stats(learnerId || ''),
    queryFn: async () => {
      // Get learner profile for total earnings
      const learner = await productionService.getLearnerById(learnerId!);
      if (!learner) {
        return {
          totalAssignments: 0,
          completed: 0,
          inProgress: 0,
          inReview: 0,
          totalEarnings: 0,
          avgRating: null as number | null,
        };
      }

      // Get all assignments for this learner
      const assignments = await productionService.getAssignmentsByLearnerId(learnerId!);

      // Calculate stats from assignments
      const completed = assignments.filter((a) => a.completed_at).length;
      const inProgress = assignments.filter(
        (a) => !a.completed_at && a.deliverable?.status === 'in_progress'
      ).length;
      const inReview = assignments.filter(
        (a) => !a.completed_at && a.deliverable?.status === 'review'
      ).length;

      // Calculate average rating from completed assignments with ratings
      const ratedAssignments = assignments.filter(
        (a) => a.completed_at && a.quality_rating !== null && a.quality_rating !== undefined
      );
      const avgRating =
        ratedAssignments.length > 0
          ? ratedAssignments.reduce((sum, a) => sum + (a.quality_rating || 0), 0) /
            ratedAssignments.length
          : null;

      return {
        totalAssignments: assignments.length,
        completed,
        inProgress,
        inReview,
        totalEarnings: learner.total_earnings || 0,
        avgRating,
      };
    },
    enabled: !!learnerId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get production learner statistics (admin view)
 */
export function useProductionLearnerStats() {
  return useQuery({
    queryKey: [...solutionsHubKeys.productionLearners.all, 'stats'],
    queryFn: () => productionService.getLearnerStats(),
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
    queryFn: () => {
      if (division) {
        return productionService.getAvailableDeliverablesForDivision(division);
      }
      // If no division specified, get available work across all divisions
      // ContentDivision: 'video' | 'design' | 'writing' | 'animation' | 'social' | 'other'
      return Promise.all([
        productionService.getAvailableDeliverablesForDivision('video'),
        productionService.getAvailableDeliverablesForDivision('design'),
        productionService.getAvailableDeliverablesForDivision('writing'),
        productionService.getAvailableDeliverablesForDivision('animation'),
        productionService.getAvailableDeliverablesForDivision('social'),
        productionService.getAvailableDeliverablesForDivision('other'),
      ]).then((results) => results.flat());
    },
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
    queryFn: async () => {
      const divisions: ContentDivision[] = ['video', 'design', 'writing', 'animation', 'social', 'other'];
      const results = await Promise.all(
        divisions.map((div) => productionService.getAvailableDeliverablesForDivision(div))
      );
      return results.flat();
    },
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
    queryFn: () => productionService.getAssignmentsByLearnerId(learnerId!),
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
    queryFn: async () => {
      const assignments = await productionService.getAssignmentsByLearnerId(learnerId!);
      return assignments.filter((a) => !a.completed_at);
    },
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
    queryFn: async () => {
      const learner = await productionService.getLearnerById(learnerId!);
      if (!learner) return { total: 0, assignments: [] };

      const assignments = await productionService.getAssignmentsByLearnerId(learnerId!);
      const completedWithEarnings = assignments.filter((a) => a.completed_at && a.earnings);

      return {
        total: learner.total_earnings || 0,
        assignments: completedWithEarnings,
      };
    },
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
    queryFn: async () => {
      const deliverable = await contentService.getDeliverableById(deliverableId);
      if (!deliverable) return null;

      // Check if learner is assigned to this deliverable
      const isAssigned = deliverable.assignments?.some(
        (a) => a.learner_id === learnerId
      );

      return {
        deliverable,
        isAssigned,
        canSubmit: isAssigned && deliverable.status !== 'approved',
      };
    },
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
    }) => productionService.claimDeliverable(deliverableId, learnerId),
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
    }) => contentService.submitForReview(deliverableId, fileUrl, fileType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.contentDeliverables.all });
    },
  });
}

/**
 * Complete an assignment
 */
export function useCompleteAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      assignmentId,
      earnings,
      qualityRating,
    }: {
      assignmentId: string;
      earnings?: number;
      qualityRating?: number;
    }) => productionService.completeAssignment(assignmentId, earnings, qualityRating),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionPortal.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionLearners.all });
    },
  });
}

/**
 * Create a new production learner
 */
export function useCreateProductionLearner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductionLearnerInput) =>
      productionService.createLearner(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionLearners.all });
    },
  });
}

/**
 * Update a production learner
 */
export function useUpdateProductionLearner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductionLearnerInput }) =>
      productionService.updateLearner(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionLearners.all });
      // data is ProductionLearner from updateLearner - id is always present
      const learner = data as ProductionLearner | null;
      if (learner?.id) {
        queryClient.setQueryData(solutionsHubKeys.productionLearners.detail(learner.id), learner);
      }
    },
  });
}

/**
 * Delete a production learner
 */
export function useDeleteProductionLearner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productionService.deleteLearner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionLearners.all });
    },
  });
}

/**
 * Add earnings to a learner
 */
export function useAddLearnerEarnings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ learnerId, amount }: { learnerId: string; amount: number }) =>
      productionService.addEarnings(learnerId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionLearners.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionPortal.all });
    },
  });
}

/**
 * Update learner skill level
 */
export function useUpdateLearnerSkillLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ learnerId, skillLevel }: { learnerId: string; skillLevel: SkillLevel }) =>
      productionService.updateSkillLevel(learnerId, skillLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.productionLearners.all });
    },
  });
}

// ============================================
// LEGACY ALIAS EXPORTS (for backward compatibility)
// ============================================

/**
 * @deprecated Use useLearnerByUserId instead
 */
export const useProductionProfile = useLearnerByUserId;

/**
 * @deprecated Use useAllAvailableWork instead
 */
export const useAvailableWork2 = useAllAvailableWork;

/**
 * @deprecated Use useClaimWork instead
 */
export function useClaimDeliverable() {
  return useClaimWork();
}

/**
 * @deprecated Use useMyStats instead
 */
export const useMyProductionStats = useMyStats;

/**
 * @deprecated Use useDeliverableForSubmission instead
 */
export const useDeliverableById = useDeliverableForSubmission;
