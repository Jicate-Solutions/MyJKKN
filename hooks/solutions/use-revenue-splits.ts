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
import { apiClient } from '@/lib/api/client';
import {
  DEFAULT_REVENUE_SPLITS,
  RECIPIENT_DISPLAY_NAMES,
} from '@/lib/services/solutions/revenue-split-service';
import type {
  SplitType,
  SplitConfig,
  CreateRevenueSplitModelInput,
  UpdateRevenueSplitModelInput,
  RevenueSplitCalculation,
  CalculatedSplit,
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
    queryFn: () => apiClient.get('/api/solutions/revenue-splits/models'),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single revenue split model by ID
 */
export function useRevenueSplitModel(id: string) {
  return useQuery({
    queryKey: revenueSplitKeys.model(id),
    queryFn: () => apiClient.get(`/api/solutions/revenue-splits/models/${id}`),
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
    queryFn: () => apiClient.get('/api/solutions/revenue-splits/models', { params: { type, default_only: 'true' } }),
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
    queryFn: () => apiClient.get('/api/solutions/revenue-splits/models', { params: { solution_type: type } }),
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
    queryFn: () => apiClient.get('/api/solutions/revenue-splits/models', { params: { type, config: 'true' } }),
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
      apiClient.post('/api/solutions/revenue-splits/models', input),
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
      apiClient.patch(`/api/solutions/revenue-splits/models/${id}`, input),
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
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/revenue-splits/models/${id}`),
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
    }) => apiClient.post<RevenueSplitCalculation>('/api/solutions/revenue-splits/calculate', { amount, split_type: splitType, ...options }),
  });
}

/**
 * Calculate revenue split for a solution by ID
 */
export function useCalculateRevenueSplitForSolution() {
  return useMutation({
    mutationFn: ({ solutionId, amount }: { solutionId: string; amount: number }) =>
      apiClient.post<RevenueSplitCalculation>('/api/solutions/revenue-splits/calculate', { solution_id: solutionId, amount }),
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
      if (solutionType === 'software') return 'software';
      if (solutionType === 'content') return 'content';
      if (solutionType === 'training') {
        return track === 'track_a' ? 'training_track_a' : 'training_track_b';
      }
      return 'software'; // Default fallback
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
      const config = { ...DEFAULT_REVENUE_SPLITS[splitType] };

      const splits: CalculatedSplit[] = [];
      let hodDiscountApplied = 0;
      let referralBonusApplied = 0;

      for (const [key, percentage] of Object.entries(config)) {
        let adjustedPercentage = percentage;
        let adjustedAmount = (amount * percentage) / 100;

        if (
          key === 'department' &&
          options?.hodDiscount &&
          options.hodDiscount > 0 &&
          options.hodDiscount <= 10
        ) {
          hodDiscountApplied = (amount * options.hodDiscount) / 100;
          adjustedAmount -= hodDiscountApplied;
          adjustedPercentage = percentage - options.hodDiscount;
        }

        if (
          key === 'department' &&
          options?.isFirstPhase &&
          options?.hasReferral &&
          splitType === 'software'
        ) {
          referralBonusApplied = (amount * 10) / 100;
          adjustedAmount -= referralBonusApplied;
          adjustedPercentage -= 10;
        }

        adjustedAmount = Math.max(0, adjustedAmount);

        splits.push({
          recipientType: key,
          recipientName: RECIPIENT_DISPLAY_NAMES[key] || key,
          percentage: adjustedPercentage,
          amount: Math.round(adjustedAmount * 100) / 100,
        });
      }

      if (referralBonusApplied > 0) {
        splits.push({
          recipientType: 'referral_bonus',
          recipientName: RECIPIENT_DISPLAY_NAMES.referral_bonus,
          percentage: 10,
          amount: Math.round(referralBonusApplied * 100) / 100,
        });
      }

      return {
        splits,
        totalAmount: amount,
        hodDiscountApplied: Math.round(hodDiscountApplied * 100) / 100,
        referralBonusApplied: Math.round(referralBonusApplied * 100) / 100,
      };
    },

    /**
     * Validate split configuration
     */
    validateConfig: (config: SplitConfig): boolean => {
      const total = Object.values(config).reduce((sum, val) => sum + val, 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new Error(`Split percentages must total 100%, got ${total}%`);
      }
      for (const [key, value] of Object.entries(config)) {
        if (typeof value !== 'number' || value < 0) {
          throw new Error(`Invalid percentage for ${key}: ${value}`);
        }
      }
      return true;
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
  const { previewSplit } = useSplitTypeHelpers();
  const calculation = previewSplit(amount, splitType, options);
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
