'use client';

/**
 * Solutions Hub - Revenue Split Hooks
 * Purpose: React Query hooks for revenue split model management and calculations
 * Implements: getRevenueSplitModels, getRevenueSplitModelById, createRevenueSplitModel,
 *             updateRevenueSplitModel, deleteRevenueSplitModel, getDefaultModelForType,
 *             calculateRevenueSplit, previewSplit
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  revenueSplitService,
  DEFAULT_REVENUE_SPLITS,
  RECIPIENT_DISPLAY_NAMES,
  type SplitType,
  type SplitConfig,
  type CreateRevenueSplitModelInput,
  type UpdateRevenueSplitModelInput,
  type RevenueSplitCalculation,
} from '@/lib/services/solutions/revenue-split-service';
import type { RevenueSplitModel, SolutionType, CohortTrack } from '@/lib/services/solutions/types';

// ============================================
// TYPES (Re-export for convenience)
// ============================================

export type {
  SplitType,
  SplitConfig,
  CreateRevenueSplitModelInput,
  UpdateRevenueSplitModelInput,
  RevenueSplitCalculation,
  RevenueSplitModel,
};

// Query keys for revenue splits
const revenueSplitKeys = {
  all: ['solutions-hub', 'revenue-splits'] as const,
  models: () => [...revenueSplitKeys.all, 'models'] as const,
  model: (id: string) => [...revenueSplitKeys.all, 'model', id] as const,
  defaultForType: (type: SplitType) => [...revenueSplitKeys.all, 'default', type] as const,
  forType: (type: SplitType) => [...revenueSplitKeys.all, 'type', type] as const,
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all revenue split models
 */
export function useRevenueSplitModels() {
  return useQuery({
    queryKey: revenueSplitKeys.models(),
    queryFn: () => revenueSplitService.getRevenueSplitModels(),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single revenue split model by ID
 */
export function useRevenueSplitModel(id: string) {
  return useQuery({
    queryKey: revenueSplitKeys.model(id),
    queryFn: () => revenueSplitService.getRevenueSplitModelById(id),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch the default revenue split model for a solution type
 */
export function useDefaultRevenueSplitModel(type: SplitType) {
  return useQuery({
    queryKey: revenueSplitKeys.defaultForType(type),
    queryFn: () => revenueSplitService.getDefaultModelForType(type),
    enabled: !!type,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch revenue split model by solution type (default or first available)
 */
export function useRevenueSplitModelByType(type: SplitType) {
  return useQuery({
    queryKey: revenueSplitKeys.forType(type),
    queryFn: () => revenueSplitService.getModelBySolutionType(type),
    enabled: !!type,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Get the split configuration for a type (from DB or defaults)
 */
export function useSplitConfig(type: SplitType) {
  return useQuery({
    queryKey: [...revenueSplitKeys.forType(type), 'config'],
    queryFn: () => revenueSplitService.getSplitConfig(type),
    enabled: !!type,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new revenue split model
 */
export function useCreateRevenueSplitModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRevenueSplitModelInput) =>
      revenueSplitService.createRevenueSplitModel(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: revenueSplitKeys.all });
    },
  });
}

/**
 * Update a revenue split model
 */
export function useUpdateRevenueSplitModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRevenueSplitModelInput }) =>
      revenueSplitService.updateRevenueSplitModel(id, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: revenueSplitKeys.all });
      queryClient.invalidateQueries({ queryKey: revenueSplitKeys.model(variables.id) });
    },
  });
}

/**
 * Delete a revenue split model
 */
export function useDeleteRevenueSplitModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => revenueSplitService.deleteRevenueSplitModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: revenueSplitKeys.all });
    },
  });
}

/**
 * Calculate revenue split for an amount (async, uses DB config)
 */
export function useCalculateRevenueSplit() {
  return useMutation({
    mutationFn: ({
      amount,
      splitType,
      options,
    }: {
      amount: number;
      splitType: SplitType;
      options?: {
        hodDiscount?: number;
        isFirstPhase?: boolean;
        hasReferral?: boolean;
        departmentId?: string;
        customSplitConfig?: SplitConfig;
      };
    }) => revenueSplitService.calculateRevenueSplit(amount, splitType, options),
  });
}

/**
 * Calculate revenue split for a solution by ID
 */
export function useCalculateRevenueSplitForSolution() {
  return useMutation({
    mutationFn: ({ solutionId, amount }: { solutionId: string; amount: number }) =>
      revenueSplitService.calculateRevenueSplitForSolution(solutionId, amount),
  });
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Get split type helper functions
 */
export function useSplitTypeHelpers() {
  return {
    /**
     * Determine split type based on solution type and training track
     */
    getSplitType: (solutionType: SolutionType, track?: CohortTrack | null): SplitType => {
      return revenueSplitService.getSplitType(solutionType, track);
    },

    /**
     * Get default split configuration (sync, no DB call)
     */
    getDefaultConfig: (type: SplitType): SplitConfig => {
      return { ...DEFAULT_REVENUE_SPLITS[type] };
    },

    /**
     * Preview split without saving (sync, no DB call)
     */
    previewSplit: (
      amount: number,
      splitType: SplitType,
      options?: {
        hodDiscount?: number;
        isFirstPhase?: boolean;
        hasReferral?: boolean;
      }
    ): RevenueSplitCalculation => {
      return revenueSplitService.previewSplit(amount, splitType, options);
    },

    /**
     * Validate split configuration
     */
    validateConfig: (config: SplitConfig): boolean => {
      return revenueSplitService.validateSplitConfig(config);
    },

    /**
     * Get display name for recipient type
     */
    getRecipientName: (type: string): string => {
      return RECIPIENT_DISPLAY_NAMES[type] || type;
    },

    /**
     * Default configurations
     */
    DEFAULT_REVENUE_SPLITS,
    RECIPIENT_DISPLAY_NAMES,
  };
}

/**
 * Hook to get a preview of revenue split (client-side, no async)
 */
export function useRevenueSplitPreview(
  amount: number,
  splitType: SplitType,
  options?: {
    hodDiscount?: number;
    isFirstPhase?: boolean;
    hasReferral?: boolean;
  }
) {
  // This is a synchronous calculation, no need for useQuery
  const calculation = revenueSplitService.previewSplit(amount, splitType, options);
  return {
    data: calculation,
    isLoading: false,
    error: null,
  };
}

// ============================================
// CONSTANTS EXPORT
// ============================================

export { DEFAULT_REVENUE_SPLITS, RECIPIENT_DISPLAY_NAMES };

/**
 * Split type labels for UI
 */
export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  software: 'Software Development',
  training_track_a: 'Training - Track A',
  training_track_b: 'Training - Track B',
  content: 'Content Production',
};

/**
 * Get formatted split description
 */
export function formatSplitDescription(config: SplitConfig): string {
  return Object.entries(config)
    .map(([key, value]) => `${RECIPIENT_DISPLAY_NAMES[key] || key}: ${value}%`)
    .join(', ');
}

/**
 * Validate that percentages sum to 100
 */
export function validatePercentages(config: SplitConfig): {
  valid: boolean;
  total: number;
  message?: string;
} {
  const total = Object.values(config).reduce((sum, val) => sum + val, 0);
  if (total !== 100) {
    return {
      valid: false,
      total,
      message: `Percentages must sum to 100%. Current total: ${total}%`,
    };
  }
  return { valid: true, total };
}
