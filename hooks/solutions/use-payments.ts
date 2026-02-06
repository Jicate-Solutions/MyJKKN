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
import {
  paymentsService,
  type PaymentFilters as ServicePaymentFilters,
  type PaymentWithDetails,
  type UpdatePaymentInput as ServiceUpdatePaymentInput,
  type MonthlyBatchSummary,
  type SplitType,
  type CalculatedSplit,
} from '@/lib/services/solutions';
import type { CreatePaymentInput as ServiceCreatePaymentInput, PaymentStatus } from '@/lib/services/solutions/types';

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
    queryFn: () => paymentsService.getPayments(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch a single payment by ID
 */
export function usePayment(id: string) {
  return useQuery({
    queryKey: solutionsHubKeys.payments.detail(id),
    queryFn: () => paymentsService.getPaymentById(id),
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
    queryFn: () => paymentsService.getPaymentsBySolution(solutionId),
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
    queryFn: () => paymentsService.getPaymentStats(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch monthly batch of payments
 */
export function useMonthlyBatch(month: number, year: number) {
  return useQuery({
    queryKey: solutionsHubKeys.payments.monthlyBatch(month, year),
    queryFn: () => paymentsService.getMonthlyBatch(month, year),
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
    queryFn: () => paymentsService.getAllSplitModels(),
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
      paymentsService.createPayment(input as ServiceCreatePaymentInput),
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
      paymentsService.updatePayment(id, input),
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
    mutationFn: (id: string) => paymentsService.deletePayment(id),
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
      paymentsService.flagPayment(id, reason),
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
    mutationFn: () => paymentsService.processAllPendingSplits(),
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
      paymentsService.calculateAndDistributeSplits(paymentId),
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
    }) => paymentsService.updateSplitModel(id, splitConfig),
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
 * Uses the service's calculation method without persisting
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
    ) => paymentsService.calculateRevenueSplits(amount, splitType, options),
  };
}

/**
 * Helper to get split type from solution type and track
 */
export function useGetSplitType() {
  return {
    getSplitType: paymentsService.getSplitType,
    REVENUE_SPLIT_CONFIGS: paymentsService.REVENUE_SPLIT_CONFIGS,
    RECIPIENT_NAMES: paymentsService.RECIPIENT_NAMES,
  };
}
