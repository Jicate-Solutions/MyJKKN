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
