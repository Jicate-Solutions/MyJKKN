'use client';

/**
 * Startup Studio - Governance & Compliance Hooks
 * Purpose: React Query hooks for governance members, compliance items,
 * and institutional readiness assessments
 * Connected to: startup-studio governance API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// GOVERNANCE MEMBER HOOKS
// ============================================

/**
 * Fetch governance members, optionally filtered by body/active status
 */
export function useGovernanceMembers(filters?: {
  body?: string;
  is_active?: boolean;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.governance.members(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/governance/members', {
        params: filters,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Add a new governance member
 */
export function useAddGovernanceMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/governance/members', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.governance.all });
    },
  });
}

/**
 * Update a governance member
 */
export function useUpdateGovernanceMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId, data }: { memberId: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/governance/members/${memberId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.governance.all });
    },
  });
}

/**
 * Remove (deactivate) a governance member
 */
export function useRemoveGovernanceMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberId: string) =>
      apiClient.delete(`/api/startup-studio/governance/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.governance.all });
    },
  });
}

// ============================================
// COMPLIANCE HOOKS
// ============================================

/**
 * Create a new compliance item
 */
export function useCreateComplianceItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/governance/compliance', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.governance.all });
    },
  });
}

/**
 * Fetch compliance items, optionally filtered
 */
export function useComplianceItems(filters?: {
  category?: string;
  status?: string;
  is_critical?: boolean;
  institution_id?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.governance.compliance(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/governance/compliance', {
        params: filters,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Update compliance item status
 */
export function useUpdateComplianceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/governance/compliance/${itemId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.governance.all });
    },
  });
}

/**
 * Fetch compliance dashboard (summary counts and rates)
 */
export function useComplianceDashboard(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.governance.complianceDashboard(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/governance/compliance/dashboard', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// READINESS ASSESSMENT HOOKS
// ============================================

/**
 * Fetch all readiness assessments
 */
export function useReadinessAssessments(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.governance.readiness(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/governance/readiness', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create a new readiness assessment
 */
export function useCreateReadinessAssessment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/governance/readiness', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.governance.all });
    },
  });
}

/**
 * Fetch the latest readiness assessment
 */
export function useLatestReadiness(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.governance.latestReadiness(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/governance/readiness/latest', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}
