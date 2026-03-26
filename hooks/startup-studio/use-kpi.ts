'use client';

/**
 * Startup Studio - KPI & Impact Framework Hooks
 * Purpose: React Query hooks for KPI definitions, measurements, dashboard, and impact reports
 * Connected to: startup-studio kpi API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startupStudioKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';

// ============================================
// KPI DEFINITION HOOKS
// ============================================

/**
 * Fetch KPI definitions with optional filters
 */
export function useKpiDefinitions(filters?: {
  framework?: string;
  category?: string;
  search?: string;
  institutionId?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.kpi.list(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/kpi/definitions', {
        params: {
          framework: filters?.framework,
          category: filters?.category,
          search: filters?.search,
          institution_id: filters?.institutionId,
        },
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single KPI definition with its latest measurement
 */
export function useKpiDefinition(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.kpi.detail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/kpi/definitions/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create a new KPI definition
 */
export function useCreateKpiDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/kpi/definitions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.kpi.all });
    },
  });
}

/**
 * Update an existing KPI definition
 */
export function useUpdateKpiDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/kpi/definitions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.kpi.all });
    },
  });
}

// ============================================
// KPI MEASUREMENT HOOKS
// ============================================

/**
 * Record a new KPI measurement
 */
export function useRecordMeasurement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      kpiId,
      data,
    }: {
      kpiId: string;
      data: Record<string, any>;
    }) =>
      apiClient.post(`/api/startup-studio/kpi/definitions/${kpiId}/measurements`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.kpi.all });
    },
  });
}

// ============================================
// KPI DASHBOARD HOOKS
// ============================================

/**
 * Fetch the KPI dashboard: KPIs grouped by framework with latest values
 */
export function useKpiDashboard(institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.kpi.dashboard(institutionId),
    queryFn: () =>
      apiClient.get('/api/startup-studio/kpi/dashboard', {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

/**
 * Fetch framework-specific compliance metrics
 */
export function useFrameworkCompliance(framework: string, institutionId?: string) {
  return useQuery({
    queryKey: startupStudioKeys.kpi.compliance(framework, institutionId),
    queryFn: () =>
      apiClient.get(`/api/startup-studio/kpi/compliance/${framework}`, {
        params: institutionId ? { institution_id: institutionId } : undefined,
      }),
    enabled: !!framework,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// IMPACT REPORT HOOKS
// ============================================

/**
 * Fetch impact reports with optional filters
 */
export function useImpactReports(filters?: {
  status?: string;
  report_type?: string;
  institutionId?: string;
}) {
  return useQuery({
    queryKey: startupStudioKeys.kpi.reports(filters),
    queryFn: () =>
      apiClient.get('/api/startup-studio/kpi/reports', {
        params: {
          status: filters?.status,
          report_type: filters?.report_type,
          institution_id: filters?.institutionId,
        },
      }),
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetch a single impact report
 */
export function useImpactReport(id: string) {
  return useQuery({
    queryKey: startupStudioKeys.kpi.reportDetail(id),
    queryFn: () => apiClient.get(`/api/startup-studio/kpi/reports/${id}`),
    enabled: !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Create a new impact report
 */
export function useCreateImpactReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiClient.post('/api/startup-studio/kpi/reports', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.kpi.all });
    },
  });
}

/**
 * Update an existing impact report
 */
export function useUpdateImpactReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, any> }) =>
      apiClient.patch(`/api/startup-studio/kpi/reports/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: startupStudioKeys.kpi.all });
    },
  });
}
