'use client';

/**
 * Startup Studio - Finance Hooks
 * Purpose: React Query hooks for grants, budgets, revenue, audit records,
 * sustainability metrics, and grant utilization
 * Connected to: startup-studio finance API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// GRANT HOOKS
// ============================================

/**
 * Fetch all grants for an institution
 */
export function useGrants(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.finance.grants(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/finance/grants', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single grant by ID
 */
export function useGrant(grantId: string) {
  return useQuery({
    queryKey: startupStudioKeys.finance.grant(grantId),
    queryFn: () => apiClient.get(`/api/startup-studio/finance/grants/${grantId}`),
    enabled: !!grantId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create a new grant
 */
export function useCreateGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/finance/grants', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.finance.all });
    },
  });
}

/**
 * Update an existing grant
 */
export function useUpdateGrant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ grantId, data }: { grantId: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/finance/grants/${grantId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.finance.all });
    },
  });
}

// ============================================
// BUDGET HOOKS
// ============================================

/**
 * Fetch budgets, optionally filtered
 */
export function useBudgets(filters?: {
  fiscal_year?: string;
  grant_id?: string;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.finance.budgets(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/finance/budgets', {
        params: filters,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create a new budget line
 */
export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/finance/budgets', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.finance.all });
    },
  });
}

// ============================================
// REVENUE HOOKS
// ============================================

/**
 * Fetch revenue records, optionally filtered
 */
export function useRevenue(filters?: {
  fiscal_year?: string;
  source?: string;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.finance.revenue(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/finance/revenue', {
        params: filters,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Record a new revenue entry
 */
export function useRecordRevenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/finance/revenue', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.finance.all });
    },
  });
}

// ============================================
// AUDIT RECORD HOOKS
// ============================================

/**
 * Fetch audit records, optionally filtered
 */
export function useAuditRecords(filters?: {
  status?: string;
  audit_type?: string;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.finance.auditRecords(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/finance/audits', {
        params: filters,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create a new audit record
 */
export function useCreateAuditRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/finance/audit-records', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.finance.all });
    },
  });
}

// ============================================
// ANALYTICS HOOKS
// ============================================

/**
 * Fetch sustainability metrics (self-generated vs grant income ratio)
 */
export function useSustainabilityMetrics(filters?: {
  fiscal_year?: string;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.finance.sustainability(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/finance/sustainability', {
        params: filters,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch grant utilization summary
 */
export function useGrantUtilization(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.finance.grantUtilization(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/finance/grant-utilization', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}
