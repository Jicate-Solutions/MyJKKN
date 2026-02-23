// hooks/regulatory/use-metrics.ts
// React Query hooks for regulatory metrics and metric values

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'
import { frameworkKeys } from './use-frameworks'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MetricFilters {
  framework_id?: string
  criteria_id?: string
  institution_id?: string
  metric_type?: string
  search?: string
  page?: number
  limit?: number
}

export interface UpsertMetricValueInput {
  metric_id: string
  framework_id: string
  institution_id: string
  academic_year: string
  value: any
  numeric_value?: number
  text_value?: string
  json_value?: Record<string, any>
  updated_by?: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const metricKeys = {
  all: ['regulatory-metrics'] as const,
  lists: () => [...metricKeys.all, 'list'] as const,
  list: (filters: MetricFilters) => [...metricKeys.lists(), filters] as const,
  details: () => [...metricKeys.all, 'detail'] as const,
  detail: (id: string) => [...metricKeys.details(), id] as const,
  values: () => [...metricKeys.all, 'values'] as const,
  valuesFor: (frameworkId: string, institutionId?: string, academicYear?: string) =>
    [...metricKeys.values(), frameworkId, institutionId, academicYear] as const,
  history: () => [...metricKeys.all, 'history'] as const,
  historyFor: (metricId: string, institutionId?: string) =>
    [...metricKeys.history(), metricId, institutionId] as const
}

// ---------------------------------------------------------------------------
// Helper: get fresh Supabase client
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// useMetrics — list metrics by criteria / framework
// ---------------------------------------------------------------------------
export function useMetrics(
  filters: MetricFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<MetricFilters>(
    () => ({ ...filters, institution_id: institutionId }),
    [
      filters.framework_id,
      filters.criteria_id,
      filters.metric_type,
      filters.search,
      filters.page,
      filters.limit,
      institutionId
    ]
  )

  const queryKey = useMemo(() => metricKeys.list(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    try {
      let query = (getSupabase() as any)
        .from('regulatory_metrics')
        .select('*', { count: 'exact' })

      if (resolvedFilters.criteria_id) {
        query = query.eq('criteria_id', resolvedFilters.criteria_id)
      }
      if (resolvedFilters.framework_id) {
        // Metrics don't have framework_id directly; join through criteria
        const { data: criteriaIds } = await (getSupabase() as any)
          .from('regulatory_criteria')
          .select('id')
          .eq('framework_id', resolvedFilters.framework_id)

        if (criteriaIds && criteriaIds.length > 0) {
          query = query.in(
            'criteria_id',
            criteriaIds.map((c: any) => c.id)
          )
        } else {
          return { data: [], metadata: { total: 0, page: 1, limit: 20, totalPages: 0 } }
        }
      }
      if (resolvedFilters.metric_type) {
        query = query.eq('metric_type', resolvedFilters.metric_type)
      }
      if (resolvedFilters.search) {
        query = query.or(
          `name.ilike.%${resolvedFilters.search}%,code.ilike.%${resolvedFilters.search}%,description.ilike.%${resolvedFilters.search}%`
        )
      }

      const page = resolvedFilters.page || 1
      const limit = resolvedFilters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })

      const { data, error, count } = await query

      if (error) throw error

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      }
    } catch (error) {
      console.error('[useMetrics] Fetch Error:', error)
      throw new Error('Failed to fetch regulatory metrics')
    }
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
    queryFn: async () => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_metrics')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Metric not found')
      return data
    },
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
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_metric_values')
        .select('*')
        .eq('framework_id', frameworkId)

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }
      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      const { data, error } = await query.order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
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
    mutationFn: async (input: UpsertMetricValueInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_metric_values')
        .upsert(
          {
            metric_id: input.metric_id,
            framework_id: input.framework_id,
            institution_id: input.institution_id,
            academic_year: input.academic_year,
            value: input.value,
            numeric_value: input.numeric_value,
            text_value: input.text_value,
            json_value: input.json_value,
            updated_by: input.updated_by,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: 'metric_id,institution_id,academic_year'
          }
        )
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      toast.success('Metric value saved')
      queryClient.invalidateQueries({
        queryKey: metricKeys.valuesFor(variables.framework_id, variables.institution_id, variables.academic_year)
      })
      queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metric_id) })
      queryClient.invalidateQueries({ queryKey: frameworkKeys.completeness() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save metric value')
    }
  })
}

// ---------------------------------------------------------------------------
// useMetricHistory — audit trail for a specific metric at an institution
// ---------------------------------------------------------------------------
export function useMetricHistory(
  metricId: string,
  institutionId?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: metricKeys.historyFor(metricId, resolvedInstitutionId),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_metric_values')
        .select('*')
        .eq('metric_id', metricId)

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }

      const { data, error } = await query.order('updated_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!metricId &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
