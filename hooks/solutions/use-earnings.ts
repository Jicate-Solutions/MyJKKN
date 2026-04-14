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
import { apiClient } from '@/lib/api/client';
import type {
  EarningsFilters as ServiceEarningsFilters,
  EarningsWithPayment,
  EarningsSummary,
  RecipientTotalEarnings,
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
  recipient_id?: string;
  builder_id?: string;
  cohort_member_id?: string;
  production_learner_id?: string;
  department_id?: string;
  institution_id?: string;
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
    queryFn: () => apiClient.get('/api/solutions/earnings', { params: filters as Record<string, any> }),
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Fetch earnings by recipient
 */
export function useEarningsByRecipient(recipientType: RecipientType, recipientId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.byRecipient(recipientType, recipientId),
    queryFn: () => apiClient.get('/api/solutions/earnings', { params: { recipient_type: recipientType, recipient_id: recipientId } }),
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
    queryFn: () => apiClient.get('/api/solutions/earnings/summary'),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch earnings statistics (more detailed dashboard metrics)
 */
export function useEarningsStats() {
  return useQuery({
    queryKey: ['solutions-hub', 'earnings', 'stats'],
    queryFn: () => apiClient.get('/api/solutions/earnings', { params: { stats: 'true' } }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch total earnings for a recipient
 */
export function useRecipientTotalEarnings(recipientType: RecipientType, recipientId: string) {
  return useQuery({
    queryKey: solutionsHubKeys.earnings.total(recipientType, recipientId),
    queryFn: () => apiClient.get('/api/solutions/earnings', { params: { recipient_type: recipientType, recipient_id: recipientId, total_only: 'true' } }),
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
    queryFn: () => apiClient.get('/api/solutions/earnings', { params: { department_id: departmentId, dateFrom: fromDate, dateTo: toDate } }),
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
    queryFn: () => apiClient.get('/api/solutions/earnings/report', { params: { month: String(month), year: String(year) } }),
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
    mutationFn: (input: CreateEarningInput) => apiClient.post('/api/solutions/earnings', input),
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
    }) => apiClient.patch('/api/solutions/earnings', { id, status, paid_at: paidAt }),
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
      apiClient.patch('/api/solutions/earnings', { ids, status, _bulk: true }),
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
    mutationFn: (paymentId: string) => apiClient.post('/api/solutions/earnings', { payment_id: paymentId, _action: 'approve' }),
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
      apiClient.patch('/api/solutions/earnings', { ids, status: 'paid', paid_at: paidAt, _bulk: true }),
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
