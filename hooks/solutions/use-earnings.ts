'use client';

/**
 * Solutions Hub - Earnings Hooks
 * Purpose: React Query hooks for earnings ledger management
 * Migrated from: JKKN-Solutions-Hub/src/hooks/use-earnings.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

// ============================================
// TYPES
// ============================================

export type RecipientType =
  | 'builder'
  | 'cohort_member'
  | 'production_learner'
  | 'department'
  | 'jicate'
  | 'institution'
  | 'council'
  | 'infrastructure'
  | 'referral_bonus';

export type EarningsStatus = 'pending' | 'processed' | 'paid';

export interface EarningsFilters {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  payment_id?: string;
  recipient_type?: RecipientType;
  recipient_id?: string;
  department_id?: string;
  status?: EarningsStatus;
  from_date?: string;
  to_date?: string;
  page?: number;
  limit?: number;
}

// ============================================
// SERVICE PLACEHOLDER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EarningsService = any;

const earningsService: EarningsService = {
  getEarnings: async (_filters?: EarningsFilters) => {
    throw new Error('earningsService.getEarnings not implemented');
  },
  getEarningsByRecipient: async (_recipientType: RecipientType, _recipientId: string) => {
    throw new Error('earningsService.getEarningsByRecipient not implemented');
  },
  getEarningsSummary: async () => {
    throw new Error('earningsService.getEarningsSummary not implemented');
  },
  getRecipientTotalEarnings: async (_recipientType: RecipientType, _recipientId: string) => {
    throw new Error('earningsService.getRecipientTotalEarnings not implemented');
  },
  updateEarningsStatus: async (_id: string, _status: EarningsStatus, _paidAt?: string) => {
    throw new Error('earningsService.updateEarningsStatus not implemented');
  },
  bulkUpdateEarningsStatus: async (_ids: string[], _status: EarningsStatus) => {
    throw new Error('earningsService.bulkUpdateEarningsStatus not implemented');
  },
  approvePaymentEarnings: async (_paymentId: string) => {
    throw new Error('earningsService.approvePaymentEarnings not implemented');
  },
  markEarningsAsPaid: async (_ids: string[], _paidAt?: string) => {
    throw new Error('earningsService.markEarningsAsPaid not implemented');
  },
  getDepartmentEarnings: async (_departmentId: string, _fromDate?: string, _toDate?: string) => {
    throw new Error('earningsService.getDepartmentEarnings not implemented');
  },
  getMonthlyEarningsReport: async (_month: number, _year: number) => {
    throw new Error('earningsService.getMonthlyEarningsReport not implemented');
  },
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Fetch all earnings with optional filters
 */
export function useEarnings(filters?: EarningsFilters) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.list(filters),
    queryFn: () => earningsService.getEarnings(filters),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch earnings by recipient
 */
export function useEarningsByRecipient(recipientType: RecipientType, recipientId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.byRecipient(recipientType, recipientId),
    queryFn: () => earningsService.getEarningsByRecipient(recipientType, recipientId),
    enabled: !!recipientType && !!recipientId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch earnings summary (dashboard data)
 */
export function useEarningsSummary() {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.summary(),
    queryFn: () => earningsService.getEarningsSummary(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch total earnings for a recipient
 */
export function useRecipientTotalEarnings(recipientType: RecipientType, recipientId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.total(recipientType, recipientId),
    queryFn: () => earningsService.getRecipientTotalEarnings(recipientType, recipientId),
    enabled: !!recipientType && !!recipientId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch department earnings
 */
export function useDepartmentEarnings(
  departmentId: string,
  fromDate?: string,
  toDate?: string
) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.byDepartment(departmentId, fromDate, toDate),
    queryFn: () => earningsService.getDepartmentEarnings(departmentId, fromDate, toDate),
    enabled: !!departmentId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch monthly earnings report
 */
export function useMonthlyEarningsReport(month: number, year: number) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.monthlyReport(month, year),
    queryFn: () => earningsService.getMonthlyEarningsReport(month, year),
    enabled: month > 0 && year > 0,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Update earnings status
 */
export function useUpdateEarningsStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      paidAt,
    }: {
      id: string;
      status: EarningsStatus;
      paidAt?: string;
    }) => earningsService.updateEarningsStatus(id, status, paidAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Bulk update earnings status
 */
export function useBulkUpdateEarningsStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: EarningsStatus }) =>
      earningsService.bulkUpdateEarningsStatus(ids, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

/**
 * Approve payment earnings (trigger earnings distribution)
 */
export function useApprovePaymentEarnings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentId: string) => earningsService.approvePaymentEarnings(paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.payments.all });
    },
  });
}

/**
 * Mark earnings as paid
 */
export function useMarkEarningsAsPaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, paidAt }: { ids: string[]; paidAt?: string }) =>
      earningsService.markEarningsAsPaid(ids, paidAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}
