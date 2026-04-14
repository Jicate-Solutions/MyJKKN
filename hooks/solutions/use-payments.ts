'use client';

/**
 * Solutions Hub - Payments Hooks
 * Purpose: React Query hooks for payment management
 * Implements: getPayments, getPaymentById, createPayment, updatePayment, deletePayment,
 *             getPaymentsBySolution, getPaymentStats, flagPayment, processAllPendingSplits
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import {
  REVENUE_SPLIT_CONFIGS,
  RECIPIENT_NAMES,
  type PaymentFilters as ServicePaymentFilters,
  type PaymentWithDetails,
  type UpdatePaymentInput as ServiceUpdatePaymentInput,
  type MonthlyBatchSummary,
  type SplitType,
  type CalculatedSplit,
} from '@/lib/services/solutions';
import type { CreatePaymentInput as ServiceCreatePaymentInput, PaymentStatus, SolutionType, CohortTrack } from '@/lib/services/solutions/types';

// ============================================
// TYPES (Re-export for convenience)
// ============================================

export type { PaymentStatus };
export type PaymentType =
  | 'advance'
  | 'milestone'
  | 'completion'
  | 'amc'
  | 'mou_signing'
  | 'deployment'
  | 'acceptance';

export interface PaymentFilters extends ServicePaymentFilters {
  solution_id?: string;
  search?: string;
}

export interface CreatePaymentInput extends ServiceCreatePaymentInput {}

export type UpdatePaymentInput = ServiceUpdatePaymentInput;

export interface PaymentStats {
  total_received: number;
  total_pending: number;
  this_month_received: number;
  this_month_pending: number;
  by_status: Record<PaymentStatus, number>;
}

export type { PaymentWithDetails, MonthlyBatchSummary, SplitType, CalculatedSplit };

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all payments with optional filters
 */
export function usePayments(filters?: PaymentFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.payments.list(filters),
    queryFn: () => apiClient.get('/api/solutions/payments', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single payment by ID
 */
export function usePayment(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.payments.detail(id),
    queryFn: () => apiClient.get(`/api/solutions/payments/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch payments for a specific solution
 */
export function usePaymentsBySolution(solutionId: string) {
  return useQuery({
    queryKey: [...solutionsHubKeys.payments.all, 'solution', solutionId],
    queryFn: () => apiClient.get('/api/solutions/payments', { params: { solution_id: solutionId } }),
    enabled: !!solutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch payment statistics
 */
export function usePaymentStats() {
  return useQuery({
    queryKey: solutionsHubKeys.payments.stats(),
    queryFn: () => apiClient.get('/api/solutions/payments/stats'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch monthly batch of payments
 */
export function useMonthlyBatch(month: number, year: number) {
  return useQuery({
    queryKey: solutionsHubKeys.payments.monthlyBatch(month, year),
    queryFn: () => apiClient.get('/api/solutions/payments', { params: { month, year, batch: 'true' } }),
    enabled: month > 0 && year > 0,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// Query key for revenue split models (used by multiple hooks)
const revenueSplitModelsKey = [...solutionsHubKeys.payments.all, 'split-models'] as const;

/**
 * Fetch all revenue split models
 */
export function useRevenueSplitModels() {
  return useQuery({
    queryKey: revenueSplitModelsKey,
    queryFn: () => apiClient.get('/api/solutions/revenue-splits/models'),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new payment
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePaymentInput) =>
      apiClient.post('/api/solutions/payments', input as ServiceCreatePaymentInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Update an existing payment
 */
export function useUpdatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePaymentInput }) =>
      apiClient.patch(`/api/solutions/payments/${id}`, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.payments.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Delete a payment
 */
export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/solutions/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Flag a payment for review
 */
export function useFlagPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.patch(`/api/solutions/payments/${id}`, { _action: 'flag', reason }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.payments.detail(variables.id),
      });
    },
  });
}

/**
 * Process all pending payment splits
 */
export function useProcessAllPendingSplits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post('/api/solutions/payments/process-splits', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Calculate and distribute splits for a specific payment
 */
export function useCalculateAndDistributeSplits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentId: string) =>
      apiClient.post(`/api/solutions/payments/${paymentId}/splits`, {}),
    onSuccess: (_, paymentId) => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({
        queryKey: solutionsHubKeys.payments.detail(paymentId),
      });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Update a revenue split model
 */
export function useUpdateSplitModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      splitConfig,
    }: {
      id: string;
      splitConfig: Record<string, number>;
    }) => apiClient.patch(`/api/solutions/revenue-splits/models/${id}`, splitConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: revenueSplitModelsKey,
      });
      // Also invalidate earnings since split models affect calculations
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Helper to calculate revenue splits (client-side preview)
 * Uses the local constant configs without persisting
 */
export function useCalculateRevenueSplits() {
  return {
    calculate: (
      amount: number,
      splitType: SplitType,
      options?: {
        hodDiscount?: number;
        isFirstPhase?: boolean;
        hasReferral?: boolean;
      }
    ) => {
      // Client-side calculation using constants
      const config = REVENUE_SPLIT_CONFIGS[splitType];
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
          recipientName: RECIPIENT_NAMES[key] || key,
          percentage: adjustedPercentage,
          amount: Math.round(adjustedAmount * 100) / 100,
        });
      }

      if (referralBonusApplied > 0) {
        splits.push({
          recipientType: 'referral_bonus',
          recipientName: 'Referral Bonus',
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
  };
}

/**
 * Helper to get split type from solution type and track
 */
export function useGetSplitType() {
  const getSplitType = (solutionType: SolutionType, track?: CohortTrack | null): SplitType => {
    if (solutionType === 'software') return 'software';
    if (solutionType === 'content') return 'content';
    if (solutionType === 'training') {
      return track === 'track_a' ? 'training_track_a' : 'training_track_b';
    }
    return 'software';
  };

  return {
    getSplitType,
    REVENUE_SPLIT_CONFIGS,
    RECIPIENT_NAMES,
  };
}
