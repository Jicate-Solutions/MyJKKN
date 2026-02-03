'use client';

/**
 * Solutions Hub - Payments Hooks
 * Purpose: React Query hooks for payment management
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-payments.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type PaymentType =
  | 'advance'
  | 'milestone'
  | 'completion'
  | 'amc'
  | 'mou_signing'
  | 'deployment'
  | 'acceptance';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded';

export interface PaymentFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  solution_id?: string;
  phase_id?: string;
  payment_type?: PaymentType;
  status?: PaymentStatus;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreatePaymentInput {
  solution_id?: string;
  phase_id?: string;
  order_id?: string;
  program_id?: string;
  amount: number;
  payment_type: PaymentType;
  payment_date?: string;
  reference_number?: string;
  split_model_id?: string;
  notes?: string;
}

export interface UpdatePaymentInput {
  amount?: number;
  payment_type?: PaymentType;
  status?: PaymentStatus;
  payment_date?: string;
  reference_number?: string;
  split_model_id?: string;
  notes?: string;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PaymentService = any;

const paymentsService: PaymentService = {
  getPayments: async (_filters?: PaymentFilters) => {
    throw new Error('paymentsService.getPayments not implemented');
  },
  getPaymentById: async (_id: string) => {
    throw new Error('paymentsService.getPaymentById not implemented');
  },
  createPayment: async (_input: CreatePaymentInput) => {
    throw new Error('paymentsService.createPayment not implemented');
  },
  updatePayment: async (_id: string, _input: UpdatePaymentInput) => {
    throw new Error('paymentsService.updatePayment not implemented');
  },
  deletePayment: async (_id: string) => {
    throw new Error('paymentsService.deletePayment not implemented');
  },
  getMonthlyBatch: async (_month: number, _year: number) => {
    throw new Error('paymentsService.getMonthlyBatch not implemented');
  },
  getPaymentStats: async () => {
    throw new Error('paymentsService.getPaymentStats not implemented');
  },
  flagPayment: async (_id: string, _reason: string) => {
    throw new Error('paymentsService.flagPayment not implemented');
  },
  autoProcessPendingPayments: async () => {
    throw new Error('paymentsService.autoProcessPendingPayments not implemented');
  },
};

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

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new payment
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePaymentInput) => paymentsService.createPayment(input),
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
 * Auto-process pending payments
 */
export function useAutoProcessPayments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => paymentsService.autoProcessPendingPayments(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}
