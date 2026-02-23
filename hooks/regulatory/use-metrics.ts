// hooks/regulatory/use-metrics.ts
// React Query hooks for regulatory metrics and metric values

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import {
  RegulatoryMetricService,
  type RegulatoryMetricFilters,
  type UpsertMetricValueData
} from '@/lib/services/regulatory/regulatory-metric-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'
import { frameworkKeys } from './use-frameworks'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type { RegulatoryMetricFilters, UpsertMetricValueData }

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const metricKeys = {
  all: ['regulatory-metrics'] as const,
  lists: () => [...metricKeys.all, 'list'] as const,
  list: (filters: RegulatoryMetricFilters) => [...metricKeys.lists(), filters] as const,
  details: () => [...metricKeys.all, 'detail'] as const,
  detail: (id: string) => [...metricKeys.details(), id] as const,
  values: () => [...metricKeys.all, 'values'] as const,
  valuesFor: (frameworkId: string, institutionId?: string, academicYear?: string) =>
    [...metricKeys.values(), frameworkId, institutionId, academicYear] as const,
  history: () => [...metricKeys.all, 'history'] as const,
  historyFor: (metricId: string, institutionId?: string, academicYear?: string) =>
    [...metricKeys.history(), metricId, institutionId, academicYear] as const
}

// ---------------------------------------------------------------------------
// useMetrics — list metrics by criteria / framework
// ---------------------------------------------------------------------------
export function useMetrics(
  filters: RegulatoryMetricFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<RegulatoryMetricFilters>(
    () => ({ ...filters, institution_id: institutionId }),
    [
      filters.framework_id,
      filters.criteria_id,
      filters.search,
      filters.page,
      filters.limit,
      institutionId
    ]
  )

  const queryKey = useMemo(() => metricKeys.list(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    return await RegulatoryMetricService.getMetrics(resolvedFilters)
  }, [resolvedFilters])

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useMetric — single metric with current value
// ---------------------------------------------------------------------------
export function useMetric(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: metricKeys.detail(id),
    queryFn: () => RegulatoryMetricService.getMetricById(id),
    enabled:
      !authLoading &&
      !!profile &&
      !!id &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useMetricValues — all values for a framework / institution / academic year
// ---------------------------------------------------------------------------
export function useMetricValues(
  frameworkId: string,
  institutionId?: string,
  academicYear?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: metricKeys.valuesFor(frameworkId, resolvedInstitutionId, academicYear),
    queryFn: () =>
      RegulatoryMetricService.getMetricValues(frameworkId, resolvedInstitutionId, academicYear),
    enabled:
      !authLoading &&
      !!profile &&
      !!frameworkId &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useUpsertMetricValue — mutation to set / update a metric value
// ---------------------------------------------------------------------------
export function useUpsertMetricValue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpsertMetricValueData) => {
      return await RegulatoryMetricService.upsertMetricValue(input)
    },
    onSuccess: (_data, variables) => {
      toast.success('Metric value saved')
      // UpsertMetricValueData has no framework_id, so invalidate all metric values broadly
      queryClient.invalidateQueries({ queryKey: metricKeys.values() })
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metric_id) })
      queryClient.invalidateQueries({ queryKey: frameworkKeys.completeness() })
      // Also invalidate framework-metric-values adapter cache
      queryClient.invalidateQueries({ queryKey: [...metricKeys.all, 'framework-metric-values'] })
      // Also invalidate history since a new value was recorded
      queryClient.invalidateQueries({
        queryKey: metricKeys.historyFor(variables.metric_id, variables.institution_id)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save metric value')
    }
  })
}

// ---------------------------------------------------------------------------
// Adapter hooks (used by page components with different signatures)
// ---------------------------------------------------------------------------

/**
 * useFrameworkMetricValues — adapter that accepts { framework_id, institution_id? }.
 * Returns metric values enriched with metric metadata (code, name, etc.).
 */
export function useFrameworkMetricValues(
  opts: { framework_id: string; institution_id?: string }
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...metricKeys.all, 'framework-metric-values', opts.framework_id, institutionId] as const,
    queryFn: async () => {
      // Get metrics and values separately, then merge
      const metricsResult = await RegulatoryMetricService.getMetrics({
        framework_id: opts.framework_id
      })
      const metrics = metricsResult?.data || []
      const values = await RegulatoryMetricService.getMetricValues(
        opts.framework_id,
        institutionId
      )
      const valueMap = new Map((values || []).map((v: any) => [v.metric_id, v]))

      return metrics.map((m: any) => {
        const val = valueMap.get(m.id) || {} as any
        const crit = m.criteria || {}
        return {
          id: val.id || m.id,
          metric_id: m.id,
          metric_code: m.code || '',
          metric_name: m.name || '',
          criteria_id: m.criteria_id,
          criteria_code: crit.code || '',
          criteria_name: crit.name || '',
          data_type: m.data_type || m.metric_type || 'text',
          source_type: m.source_type || 'manual',
          current_value: val.value ?? val.numeric_value ?? null,
          previous_value: val.previous_value ?? null,
          unit: m.unit || '',
          weight: m.weightage || m.weight || 0,
          max_score: m.max_score || 0,
          score: val.score ?? null,
          last_updated_at: val.updated_at || null,
          last_updated_by: val.entered_by || null
        }
      })
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!opts.framework_id &&
      (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

/**
 * useUpdateMetricValue — adapter that accepts { metric_id, framework_id, institution_id?, academic_year?, value }.
 * Simpler API used by page components. framework_id is used for cache invalidation only.
 */
export function useUpdateMetricValue() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      metric_id: string
      framework_id: string
      institution_id?: string
      academic_year?: string
      value: any
    }) => {
      return await RegulatoryMetricService.upsertMetricValue({
        metric_id: input.metric_id,
        institution_id: input.institution_id || profile?.institution_id || '',
        academic_year: input.academic_year || new Date().getFullYear().toString(),
        value: typeof input.value === 'string' ? input.value : String(input.value ?? ''),
        numeric_value: typeof input.value === 'number' ? input.value : undefined
      })
    },
    onSuccess: (_data, variables) => {
      toast.success('Metric value updated')
      queryClient.invalidateQueries({
        queryKey: [...metricKeys.all, 'framework-metric-values', variables.framework_id]
      })
      queryClient.invalidateQueries({
        queryKey: metricKeys.valuesFor(variables.framework_id)
      })
      queryClient.invalidateQueries({ queryKey: frameworkKeys.completeness() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update metric value')
      console.error('[useUpdateMetricValue] Error:', error)
    }
  })
}

/**
 * useRefreshAutoMetric — refresh a single auto-calculated metric.
 * Invalidates cache to trigger re-fetch of calculated values.
 */
export function useRefreshAutoMetric() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      metric_id: string
      framework_id: string
      institution_id?: string
    }) => {
      queryClient.invalidateQueries({
        queryKey: [...metricKeys.all, 'framework-metric-values', input.framework_id]
      })
      queryClient.invalidateQueries({
        queryKey: metricKeys.valuesFor(input.framework_id)
      })
      return { success: true }
    }
  })
}

/**
 * useBulkRefreshAutoMetrics — refresh all auto metrics for a framework.
 */
export function useBulkRefreshAutoMetrics() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      framework_id: string
      institution_id?: string
    }) => {
      queryClient.invalidateQueries({
        queryKey: [...metricKeys.all, 'framework-metric-values', input.framework_id]
      })
      queryClient.invalidateQueries({
        queryKey: metricKeys.valuesFor(input.framework_id)
      })
      return { success: true }
    }
  })
}

// ---------------------------------------------------------------------------
// useMetricHistory — audit trail for a specific metric at an institution
// Uses regulatory_metric_value_history table (populated by DB trigger)
// ---------------------------------------------------------------------------
export function useMetricHistory(
  metricId: string,
  institutionId?: string,
  academicYear?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: metricKeys.historyFor(metricId, resolvedInstitutionId, academicYear),
    queryFn: () =>
      RegulatoryMetricService.getMetricHistory(metricId, resolvedInstitutionId, academicYear),
    enabled:
      !authLoading &&
      !!profile &&
      !!metricId &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
