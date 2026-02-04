'use client';

/**
 * Solutions Hub - Earnings Hooks
 * Purpose: React Query hooks for earnings ledger management
 * Implements: getEarnings, getEarningsByRecipient, createEarningEntry, getEarningsStats,
 *             getEarningsSummary, updateEarningsStatus, bulkUpdateEarningsStatus,
 *             approvePaymentEarnings, markEarningsAsPaid, getDepartmentEarnings,
 *             getMonthlyEarningsReport
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  earningsService,
  type EarningsFilters as ServiceEarningsFilters,
  type EarningsWithPayment,
  type EarningsSummary,
  type RecipientTotalEarnings,
} from '@/lib/services/solutions';
import type { RecipientType, EarningsStatus } from '@/lib/services/solutions/types';

// ============================================
// TYPES (Re-export for convenience)
// ============================================

export type { RecipientType, EarningsStatus, EarningsWithPayment, EarningsSummary, RecipientTotalEarnings };

export type EarningsFilters = ServiceEarningsFilters;

export interface CreateEarningInput {
  payment_id: string;
  recipient_type: RecipientType;
  recipient_name: string;
  recipient_id?: string;
  department_id?: string;
  amount: number;
  percentage: number;
  status?: EarningsStatus;
}

export interface EarningsStats {
  total_calculated: number;
  total_approved: number;
  total_paid: number;
  this_month_total: number;
  by_recipient_type: Record<string, { calculated: number; approved: number; paid: number }>;
}

export interface DepartmentEarnings {
  entries: EarningsWithPayment[];
  total: number;
  by_status: Record<EarningsStatus, number>;
}

export interface MonthlyEarningsReport {
  month: string;
  year: number;
  by_recipient_type: Record<string, number>;
  total: number;
  entries: EarningsWithPayment[];
}

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
 * Fetch earnings summary (dashboard data grouped by recipient type)
 */
export function useEarningsSummary() {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.summary(),
    queryFn: () => earningsService.getEarningsSummary(),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch earnings statistics (more detailed dashboard metrics)
 */
export function useEarningsStats() {
  return useQuery({
    queryKey: ['solutions-hub', 'earnings', 'stats'],
    queryFn: () => earningsService.getEarningsStats(),
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
 * Create a new earnings entry
 */
export function useCreateEarningEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEarningInput) => earningsService.createEarningEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: solutionsHubKeys.earnings.all });
    },
  });
}

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

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get display name for a recipient type
 */
export function getRecipientTypeDisplayName(type: RecipientType): string {
  const displayNames: Record<RecipientType, string> = {
    builder: 'Builder',
    cohort_member: 'Cohort Member',
    production_learner: 'Production Learner',
    department: 'Department',
    jicate: 'JICATE',
    institution: 'Institution',
    council: 'Council',
    infrastructure: 'Infrastructure',
    referral_bonus: 'Referral Bonus',
  };
  return displayNames[type] || type;
}

/**
 * Get color for earnings status
 */
export function getEarningsStatusColor(status: EarningsStatus): string {
  const colors: Record<EarningsStatus, string> = {
    calculated: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/**
 * Format earnings amount in INR
 */
export function formatEarningsAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
