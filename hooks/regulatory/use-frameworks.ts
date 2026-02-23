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
      filters.body,
      filters.status,
      filters.version,
      filters.framework_type,
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
// Adapter hooks (used by page components with different signatures)
// ---------------------------------------------------------------------------

/**
 * useRegulatoryFrameworks — alias expected by the dashboard page.
 * Accepts an object { institution_id? } and returns just the data array.
 */
export function useRegulatoryFrameworks(
  opts: { institution_id?: string } = {}
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...frameworkKeys.all, 'flat-list', institutionId] as const,
    queryFn: async () => {
      try {
        const result = await RegulatoryFrameworkService.getFrameworks({
          institution_id: institutionId
        })
        return result?.data || []
      } catch (error) {
        console.error('[useRegulatoryFrameworks] Fetch Error:', error)
        throw new Error('Failed to fetch regulatory frameworks')
      }
    },
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA
  })
}

/**
 * useRegulatoryDashboardStats — lightweight summary stats for the dashboard.
 * Returns { total_frameworks, active_submissions, avg_completeness, upcoming_deadlines }.
 */
export function useRegulatoryDashboardStats(
  opts: { institution_id?: string } = {}
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: [...frameworkKeys.all, 'dashboard-stats', institutionId] as const,
    queryFn: async () => {
      try {
        // Frameworks count
        const frameworks = await RegulatoryFrameworkService.getFrameworks({
          institution_id: institutionId
        })
        const totalFrameworks = frameworks?.data?.length ?? 0

        // Submissions count
        const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient()
        let subQuery = (supabase as any)
          .from('regulatory_submissions')
          .select('id, status, completeness_pct', { count: 'exact' })
          .in('status', ['draft', 'data_collection', 'in_review'])
        if (institutionId) {
          subQuery = subQuery.eq('institution_id', institutionId)
        }
        const { data: subs, count: activeSubmissions } = await subQuery

        // Avg completeness across frameworks
        const fwData = frameworks?.data || []
        const avgCompleteness = fwData.length > 0
          ? Math.round(fwData.reduce((sum: number, fw: any) => sum + (fw.completeness_pct || 0), 0) / fwData.length)
          : 0

        // Upcoming deadlines (next 30 days)
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
        let deadlineQuery = (supabase as any)
          .from('regulatory_submissions')
          .select('id', { count: 'exact' })
          .lte('due_date', thirtyDaysFromNow.toISOString())
          .gte('due_date', new Date().toISOString())
          .in('status', ['draft', 'data_collection', 'in_review'])
        if (institutionId) {
          deadlineQuery = deadlineQuery.eq('institution_id', institutionId)
        }
        const { count: upcomingDeadlines } = await deadlineQuery

        return {
          total_frameworks: totalFrameworks,
          active_submissions: activeSubmissions || 0,
          avg_completeness: avgCompleteness,
          upcoming_deadlines: upcomingDeadlines || 0
        }
      } catch (error) {
        console.error('[useRegulatoryDashboardStats] Error:', error)
        return {
          total_frameworks: 0,
          active_submissions: 0,
          avg_completeness: 0,
          upcoming_deadlines: 0
        }
      }
    },
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

/**
 * useUpcomingDeadlines — submissions due within N days.
 */
export function useUpcomingDeadlines(
  opts: { institution_id?: string; limit?: number } = {}
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)
  const limit = opts.limit ?? 5

  return useQuery<any[], Error>({
    queryKey: [...frameworkKeys.all, 'upcoming-deadlines', institutionId, limit] as const,
    queryFn: async () => {
      try {
        const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient()
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

        let query = (supabase as any)
          .from('regulatory_submissions')
          .select('id, framework_id, due_date, status, academic_year, updated_at')
          .not('due_date', 'is', null)
          .gte('due_date', new Date().toISOString())
          .lte('due_date', thirtyDaysFromNow.toISOString())
          .in('status', ['draft', 'data_collection', 'in_review'])
          .order('due_date', { ascending: true })
          .limit(limit)

        if (institutionId) {
          query = query.eq('institution_id', institutionId)
        }

        const { data, error } = await query

        if (error) throw error

        // Enrich with framework info
        const enriched = await Promise.all(
          (data || []).map(async (sub: any) => {
            const { data: fw } = await (supabase as any)
              .from('regulatory_frameworks')
              .select('name, body')
              .eq('id', sub.framework_id)
              .maybeSingle()

            const dueDate = new Date(sub.due_date)
            const now = new Date()
            const diffMs = dueDate.getTime() - now.getTime()
            const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

            return {
              ...sub,
              framework_name: fw?.name || 'Unknown',
              body: fw?.body || 'Unknown',
              submission_type: sub.academic_year || 'Annual',
              days_remaining: daysRemaining
            }
          })
        )

        return enriched
      } catch (error) {
        console.error('[useUpcomingDeadlines] Error:', error)
        return []
      }
    },
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

/**
 * useFrameworkDetail — single framework by { framework_id, institution_id? }.
 * Adapter for useFramework that accepts an object param.
 */
export function useFrameworkDetail(
  opts: { framework_id: string; institution_id?: string }
) {
  return useFramework(opts.framework_id)
}

/**
 * useFrameworkCriteria — list criteria for a framework.
 * Accepts { framework_id }.
 */
export function useFrameworkCriteria(
  opts: { framework_id: string }
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery<any[], Error>({
    queryKey: [...frameworkKeys.all, 'criteria', opts.framework_id] as const,
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient()
      const { data, error } = await (supabase as any)
        .from('regulatory_criteria')
        .select('*')
        .eq('framework_id', opts.framework_id)
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!opts.framework_id &&
      (isSuperAdmin || !!profile?.institution_id),
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
