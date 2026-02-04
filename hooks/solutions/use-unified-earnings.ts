'use client';

/**
 * Solutions Hub - Unified Earnings Hooks
 * Purpose: React Query hooks for unified earnings view across all talent types
 * Connected to: unified-earnings-service.ts
 */

import { useQuery } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import {
  unifiedEarningsService,
  type UnifiedEarningsFilters,
  type TalentType,
  type UnifiedEarningsEntry,
  type EarningsSummary,
  type PayoutHistoryEntry,
} from '@/lib/services/solutions/unified-earnings-service';
import type { BaseListResponse } from '@/lib/services/base-service';

// Re-export types for consumers
export type {
  TalentType,
  UnifiedEarningsFilters,
  UnifiedEarningsEntry,
  EarningsSummary,
  PayoutHistoryEntry,
};

// ============================================
// QUERY KEYS
// ============================================

// Extend the existing query keys for unified earnings
const unifiedEarningsKeys = {
  all: [...solutionsHubKeys.earnings.all, 'unified'] as const,
  list: (userId: string, filters?: UnifiedEarningsFilters) =>
    [...unifiedEarningsKeys.all, 'list', userId, filters] as const,
  summary: (userId: string) =>
    [...unifiedEarningsKeys.all, 'summary', userId] as const,
  payouts: (userId: string, filters?: UnifiedEarningsFilters) =>
    [...unifiedEarningsKeys.all, 'payouts', userId, filters] as const,
};

// ============================================
// QUERY HOOKS
// ============================================

/**
 * Get unified earnings for a user across all talent types
 * Aggregates earnings from builder, cohort member, and production learner profiles
 */
export function useUnifiedEarnings(
  userId: string | undefined,
  filters?: UnifiedEarningsFilters
) {
  return useQuery<BaseListResponse<UnifiedEarningsEntry>>({
    queryKey: unifiedEarningsKeys.list(userId || '', filters),
    queryFn: () => unifiedEarningsService.getUnifiedEarnings(userId!, filters),
    enabled: !!userId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Get earnings summary for a user with aggregated statistics
 * Includes totals, breakdown by talent type, monthly trends, and recent payouts
 */
export function useEarningsSummary(userId: string | undefined) {
  return useQuery<EarningsSummary>({
    queryKey: unifiedEarningsKeys.summary(userId || ''),
    queryFn: () => unifiedEarningsService.getEarningsSummary(userId!),
    enabled: !!userId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Get payout history for a user (paid earnings only)
 */
export function usePayoutHistory(
  userId: string | undefined,
  filters?: UnifiedEarningsFilters
) {
  return useQuery<BaseListResponse<PayoutHistoryEntry>>({
    queryKey: unifiedEarningsKeys.payouts(userId || '', filters),
    queryFn: () => unifiedEarningsService.getPayoutHistory(userId!, filters),
    enabled: !!userId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get display label for talent type
 */
export function getTalentTypeLabel(type: TalentType): string {
  const labels: Record<TalentType, string> = {
    builder: 'Builder',
    cohort_member: 'Cohort',
    production_learner: 'Production',
  };
  return labels[type] || type;
}

/**
 * Get color class for talent type
 */
export function getTalentTypeColor(type: TalentType): string {
  const colors: Record<TalentType, string> = {
    builder: 'bg-blue-100 text-blue-800',
    cohort_member: 'bg-green-100 text-green-800',
    production_learner: 'bg-purple-100 text-purple-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

/**
 * Get icon name for talent type (for use with lucide icons)
 */
export function getTalentTypeIcon(type: TalentType): string {
  const icons: Record<TalentType, string> = {
    builder: 'Code',
    cohort_member: 'GraduationCap',
    production_learner: 'Palette',
  };
  return icons[type] || 'User';
}

/**
 * Format currency amount in INR
 */
export function formatEarningsAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get status badge variant
 */
export function getEarningsStatusVariant(
  status: string
): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'paid':
      return 'default';
    case 'approved':
      return 'secondary';
    case 'calculated':
      return 'outline';
    default:
      return 'outline';
  }
}

/**
 * Get status display label
 */
export function getEarningsStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    calculated: 'Pending',
    approved: 'Approved',
    paid: 'Paid',
  };
  return labels[status] || status;
}
