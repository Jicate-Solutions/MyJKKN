// hooks/regulatory/use-frameworks.ts
// React Query hooks for regulatory frameworks (NAAC, NBA, NIRF, etc.)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import {
  RegulatoryFrameworkService,
  type RegulatoryFrameworkFilters
} from '@/lib/services/regulatory/regulatory-framework-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const frameworkKeys = {
  all: ['regulatory-frameworks'] as const,
  lists: () => [...frameworkKeys.all, 'list'] as const,
  list: (filters: RegulatoryFrameworkFilters) =>
    [...frameworkKeys.lists(), filters] as const,
  details: () => [...frameworkKeys.all, 'detail'] as const,
  detail: (id: string) => [...frameworkKeys.details(), id] as const,
  trees: () => [...frameworkKeys.all, 'tree'] as const,
  tree: (id: string) => [...frameworkKeys.trees(), id] as const,
  completeness: () => [...frameworkKeys.all, 'completeness'] as const,
  completenessFor: (
    frameworkId: string,
    institutionId?: string,
    academicYear?: string
  ) =>
    [
      ...frameworkKeys.completeness(),
      frameworkId,
      institutionId,
      academicYear
    ] as const
}

// ---------------------------------------------------------------------------
// useFrameworks — list frameworks with pagination & filters
// ---------------------------------------------------------------------------
export function useFrameworks(
  filters: RegulatoryFrameworkFilters = {}
): UseQueryResult<
  { data: any[]; metadata: { total: number; page: number; limit: number; totalPages: number } },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const resolvedFilters = useMemo<RegulatoryFrameworkFilters>(
    () => ({
      ...filters,
      institution_id: filters.institution_id ?? institutionId
    }),
    [
      filters.institution_id,
      filters.body_name,
      filters.status,
      filters.version_year,
      filters.search,
      filters.page,
      filters.limit,
      institutionId
    ]
  )

  const queryKey = useMemo(
    () => frameworkKeys.list(resolvedFilters),
    [resolvedFilters]
  )

  const queryFn = useCallback(async () => {
    try {
      return await RegulatoryFrameworkService.getFrameworks(resolvedFilters)
    } catch (error) {
      console.error('[useFrameworks] Fetch Error:', error)
      throw new Error('Failed to fetch regulatory frameworks')
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
// useFramework — single framework detail
// ---------------------------------------------------------------------------
export function useFramework(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: frameworkKeys.detail(id),
    queryFn: () => RegulatoryFrameworkService.getFrameworkById(id),
    enabled: !authLoading && !!profile && !!id && (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useFrameworkTree — framework + criteria + metrics hierarchy
// ---------------------------------------------------------------------------
export function useFrameworkTree(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: frameworkKeys.tree(id),
    queryFn: () => RegulatoryFrameworkService.getFrameworkTree(id),
    enabled: !authLoading && !!profile && !!id && (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useFrameworkCompleteness — percentage of metrics populated
// ---------------------------------------------------------------------------
export function useFrameworkCompleteness(
  frameworkId: string,
  institutionId?: string,
  academicYear?: string
): UseQueryResult<
  { total_metrics: number; populated_metrics: number; completeness_percent: number },
  Error
> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId = institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: frameworkKeys.completenessFor(frameworkId, resolvedInstitutionId, academicYear),
    queryFn: () =>
      RegulatoryFrameworkService.getFrameworkCompleteness(
        frameworkId,
        resolvedInstitutionId,
        academicYear
      ),
    enabled:
      !authLoading &&
      !!profile &&
      !!frameworkId &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
