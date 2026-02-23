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
      queryClient.invalidateQueries({
        queryKey: metricKeys.valuesFor(variables.framework_id, variables.institution_id, variables.academic_year)
      })
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metric_id) })
      queryClient.invalidateQueries({ queryKey: frameworkKeys.completeness() })
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
