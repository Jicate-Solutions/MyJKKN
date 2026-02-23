// hooks/regulatory/use-evidence.ts
// React Query hooks for regulatory evidence (document uploads, versions, search)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import {
  RegulatoryEvidenceService,
  type EvidenceFilters,
  type UploadEvidenceData,
  type AddEvidenceVersionData
} from '@/lib/services/regulatory/regulatory-evidence-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'
import { metricKeys } from './use-metrics'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type { EvidenceFilters, UploadEvidenceData, AddEvidenceVersionData }

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const evidenceKeys = {
  all: ['regulatory-evidence'] as const,
  lists: () => [...evidenceKeys.all, 'list'] as const,
  listFor: (filters: EvidenceFilters) => [...evidenceKeys.lists(), filters] as const,
  details: () => [...evidenceKeys.all, 'detail'] as const,
  detail: (id: string) => [...evidenceKeys.details(), id] as const,
  versions: () => [...evidenceKeys.all, 'versions'] as const,
  versionsFor: (evidenceId: string) => [...evidenceKeys.versions(), evidenceId] as const,
  search: () => [...evidenceKeys.all, 'search'] as const,
  searchFor: (query: string, institutionId?: string) =>
    [...evidenceKeys.search(), query, institutionId] as const
}

// ---------------------------------------------------------------------------
// useEvidence — list evidence for a metric/criteria/institution/year
// ---------------------------------------------------------------------------
export function useEvidence(
  filters: EvidenceFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<EvidenceFilters>(
    () => ({
      ...filters,
      institution_id: resolvedInstitutionId
    }),
    [
      filters.metric_id,
      filters.criteria_id,
      filters.academic_year,
      filters.is_deleted,
      filters.page,
      filters.limit,
      resolvedInstitutionId
    ]
  )

  const queryKey = useMemo(() => evidenceKeys.listFor(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    return await RegulatoryEvidenceService.getEvidence(resolvedFilters)
  }, [resolvedFilters])

  return useQuery({
    queryKey,
    queryFn,
    enabled:
      !authLoading &&
      !!profile &&
      (!!filters.metric_id || !!filters.criteria_id) &&
      (isSuperAdmin || !!resolvedInstitutionId),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useUploadEvidence — mutation to add new evidence
// ---------------------------------------------------------------------------
export function useUploadEvidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UploadEvidenceData) => {
      return await RegulatoryEvidenceService.uploadEvidence(input)
    },
    onSuccess: (_data, variables) => {
      toast.success('Evidence uploaded successfully')
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
      if (variables.metric_id) {
        queryClient.invalidateQueries({ queryKey: metricKeys.detail(variables.metric_id) })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload evidence')
    }
  })
}

// ---------------------------------------------------------------------------
// useSoftDeleteEvidence — mutation to soft-delete evidence
// ---------------------------------------------------------------------------
export function useSoftDeleteEvidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (evidenceId: string) => {
      return await RegulatoryEvidenceService.softDeleteEvidence(evidenceId)
    },
    onSuccess: () => {
      toast.success('Evidence removed')
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove evidence')
    }
  })
}

// ---------------------------------------------------------------------------
// useEvidenceVersions — version history for a piece of evidence
// ---------------------------------------------------------------------------
export function useEvidenceVersions(evidenceId: string): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: evidenceKeys.versionsFor(evidenceId),
    queryFn: () => RegulatoryEvidenceService.getEvidenceVersions(evidenceId),
    enabled:
      !authLoading &&
      !!profile &&
      !!evidenceId &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useAddEvidenceVersion — mutation to add a new revision of evidence
// ---------------------------------------------------------------------------
export function useAddEvidenceVersion() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddEvidenceVersionData) => {
      return await RegulatoryEvidenceService.addEvidenceVersion(input)
    },
    onSuccess: (_data, variables) => {
      toast.success('New version uploaded')
      queryClient.invalidateQueries({
        queryKey: evidenceKeys.versionsFor(variables.evidence_id)
      })
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload new version')
    }
  })
}

// ---------------------------------------------------------------------------
// Adapter hooks (used by page components with different signatures)
// ---------------------------------------------------------------------------

/**
 * useFrameworkEvidence — get all evidence for a framework by { framework_id, institution_id? }.
 * Returns a flat array of evidence items.
 */
export function useFrameworkEvidence(
  opts: { framework_id: string; institution_id?: string }
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...evidenceKeys.all, 'framework-evidence', opts.framework_id, institutionId] as const,
    queryFn: async () => {
      try {
        const { createClientSupabaseClient } = await import('@/lib/supabase/client')
        const supabase = createClientSupabaseClient()

        // Get all criteria for this framework
        const { data: criteria } = await (supabase as any)
          .from('regulatory_criteria')
          .select('id, code, name')
          .eq('framework_id', opts.framework_id)

        const criteriaIds = (criteria || []).map((c: any) => c.id)
        const criteriaMap = new Map((criteria || []).map((c: any) => [c.id, c]))

        if (criteriaIds.length === 0) return []

        // Get metrics for these criteria
        const { data: metrics } = await (supabase as any)
          .from('regulatory_metrics')
          .select('id, code, criteria_id')
          .in('criteria_id', criteriaIds)

        const metricMap = new Map((metrics || []).map((m: any) => [m.id, m]))

        // Get evidence linked to these criteria or metrics
        let query = (supabase as any)
          .from('regulatory_evidence')
          .select('*')
          .or(`criteria_id.in.(${criteriaIds.join(',')}),metric_id.in.(${(metrics || []).map((m: any) => m.id).join(',')})`)

        if (institutionId) {
          query = query.eq('institution_id', institutionId)
        }
        query = query.is('deleted_at', null).order('created_at', { ascending: false })

        const { data: evidence, error } = await query

        if (error) {
          // Fallback: just return empty if the OR query fails
          console.warn('[useFrameworkEvidence] query error, returning empty:', error)
          return []
        }

        // Enrich with criteria/metric names
        return (evidence || []).map((e: any) => {
          const crit = e.criteria_id ? criteriaMap.get(e.criteria_id) : null
          const metric = e.metric_id ? metricMap.get(e.metric_id) : null
          return {
            ...e,
            criteria_code: crit?.code || '',
            criteria_name: crit?.name || '',
            metric_code: metric?.code || '',
            uploaded_by_name: e.uploaded_by_name || ''
          }
        })
      } catch (error) {
        console.error('[useFrameworkEvidence] Error:', error)
        return []
      }
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
 * useDeleteEvidence — adapter for soft-delete that accepts
 * { evidence_id, framework_id?, institution_id? }.
 */
export function useDeleteEvidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      evidence_id: string
      framework_id?: string
      institution_id?: string
    }) => {
      return await RegulatoryEvidenceService.softDeleteEvidence(input.evidence_id)
    },
    onSuccess: (_data, variables) => {
      toast.success('Evidence deleted')
      queryClient.invalidateQueries({ queryKey: evidenceKeys.lists() })
      if (variables.framework_id) {
        queryClient.invalidateQueries({
          queryKey: [...evidenceKeys.all, 'framework-evidence', variables.framework_id]
        })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete evidence')
    }
  })
}

// ---------------------------------------------------------------------------
// useEvidenceSearch — search evidence by file name, title, or description
// ---------------------------------------------------------------------------
export function useEvidenceSearch(
  searchQuery: string,
  institutionId?: string
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const filters = useMemo<EvidenceFilters>(
    () => ({
      institution_id: resolvedInstitutionId,
      page: 1,
      limit: 50
    }),
    [resolvedInstitutionId]
  )

  return useQuery({
    queryKey: evidenceKeys.searchFor(searchQuery, resolvedInstitutionId),
    queryFn: async () => {
      // Use the service's getEvidence with text search via Supabase
      // The service does not have a built-in search param, so we use
      // a direct query with search applied as an ilike filter
      const { createClientSupabaseClient } = await import('@/lib/supabase/client')
      const supabase = createClientSupabaseClient()

      let query = (supabase as any)
        .from('regulatory_evidence')
        .select('*, uploaded_by_profile:profiles!uploaded_by(id, full_name, email)', { count: 'exact' })
        .eq('is_deleted', false)
        .or(
          `file_name.ilike.%${searchQuery}%,title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
        )

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }

      query = query
        .range(0, 49)
        .order('created_at', { ascending: false })

      const { data, error, count } = await query

      if (error) throw error

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page: 1,
          limit: 50,
          totalPages: count ? Math.ceil(count / 50) : 0
        }
      }
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!searchQuery &&
      searchQuery.length >= 2 &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEARCH_DATA
  })
}
