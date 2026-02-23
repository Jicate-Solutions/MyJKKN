// hooks/regulatory/use-submissions.ts
// React Query hooks for regulatory submissions and workflow

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo, useCallback } from 'react'
import {
  RegulatorySubmissionService,
  type SubmissionFilters as ServiceSubmissionFilters,
  type CreateSubmissionData,
  type SubmissionStatus
} from '@/lib/services/regulatory/regulatory-submission-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'
import { frameworkKeys } from './use-frameworks'
import { metricKeys } from './use-metrics'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type { ServiceSubmissionFilters as SubmissionFilters, CreateSubmissionData, SubmissionStatus }

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const submissionKeys = {
  all: ['regulatory-submissions'] as const,
  lists: () => [...submissionKeys.all, 'list'] as const,
  list: (filters: ServiceSubmissionFilters) => [...submissionKeys.lists(), filters] as const,
  details: () => [...submissionKeys.all, 'detail'] as const,
  detail: (id: string) => [...submissionKeys.details(), id] as const,
  scores: () => [...submissionKeys.all, 'score'] as const,
  score: (submissionId: string) => [...submissionKeys.scores(), submissionId] as const
}

// ---------------------------------------------------------------------------
// useSubmissions — list by framework / institution / year
// ---------------------------------------------------------------------------
export function useSubmissions(
  filters: ServiceSubmissionFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<ServiceSubmissionFilters>(
    () => ({ ...filters, institution_id: institutionId }),
    [
      filters.framework_id,
      filters.academic_year,
      filters.status,
      filters.page,
      filters.limit,
      institutionId
    ]
  )

  const queryKey = useMemo(() => submissionKeys.list(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    return await RegulatorySubmissionService.getSubmissions(resolvedFilters)
  }, [resolvedFilters])

  return useQuery({
    queryKey,
    queryFn,
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useSubmission — single submission with completeness stats
// ---------------------------------------------------------------------------
export function useSubmission(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: submissionKeys.detail(id),
    queryFn: () => RegulatorySubmissionService.getSubmissionById(id),
    enabled:
      !authLoading &&
      !!profile &&
      !!id &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useCreateSubmission — mutation to create a draft submission
// ---------------------------------------------------------------------------
export function useCreateSubmission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateSubmissionData) => {
      return await RegulatorySubmissionService.createSubmission(input)
    },
    onSuccess: () => {
      toast.success('Submission created')
      queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create submission')
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdateSubmissionStatus — mutation for workflow transitions
// ---------------------------------------------------------------------------
export function useUpdateSubmissionStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; status: SubmissionStatus }) => {
      return await RegulatorySubmissionService.updateSubmissionStatus(input.id, input.status)
    },
    onSuccess: (data) => {
      const statusLabel =
        data.status === 'submitted'
          ? 'Submitted'
          : data.status === 'graded'
          ? 'Graded'
          : data.status === 'in_review'
          ? 'Sent for review'
          : data.status === 'in_progress'
          ? 'In progress'
          : data.status === 'archived'
          ? 'Archived'
          : 'Status updated'
      toast.success(statusLabel)
      queryClient.invalidateQueries({ queryKey: submissionKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update submission status')
    }
  })
}

// ---------------------------------------------------------------------------
// Adapter hooks (used by page components with different signatures)
// ---------------------------------------------------------------------------

/**
 * useAllSubmissions — returns flat array of submissions.
 * Accepts { institution_id? }.
 */
export function useAllSubmissions(
  opts: { institution_id?: string } = {}
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...submissionKeys.all, 'all-flat', institutionId] as const,
    queryFn: async () => {
      try {
        const result = await RegulatorySubmissionService.getSubmissions({
          institution_id: institutionId,
          limit: 100
        })
        // Flatten nested join objects for page convenience
        return (result?.data || []).map((sub: any) => ({
          ...sub,
          framework_name: sub.framework?.name || '',
          body: sub.framework?.body || '',
          framework_version: sub.framework?.version || '',
          institution_name: sub.institution?.name || '',
          submitted_by_name: sub.submitted_by_profile?.full_name || '',
          approved_by_name: sub.approved_by_profile?.full_name || '',
          // DDL column is completeness_percentage, alias for page
          completeness_pct: sub.completeness_percentage ?? null,
        }))
      } catch (error) {
        console.error('[useAllSubmissions] Error:', error)
        return []
      }
    },
    enabled: !authLoading && !!profile && (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

/**
 * useFrameworkSubmissions — submissions for a specific framework.
 * Accepts { framework_id, institution_id? }. Returns flat array.
 */
export function useFrameworkSubmissions(
  opts: { framework_id: string; institution_id?: string }
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...submissionKeys.all, 'framework', opts.framework_id, institutionId] as const,
    queryFn: async () => {
      try {
        const result = await RegulatorySubmissionService.getSubmissions({
          framework_id: opts.framework_id,
          institution_id: institutionId
        })
        // Flatten nested join objects for page convenience
        return (result?.data || []).map((sub: any) => ({
          ...sub,
          framework_name: sub.framework?.name || '',
          body: sub.framework?.body || '',
          institution_name: sub.institution?.name || '',
          completeness_pct: sub.completeness_percentage ?? null,
        }))
      } catch (error) {
        console.error('[useFrameworkSubmissions] Error:', error)
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
 * useStartSubmission — alias for useCreateSubmission with simpler input.
 * Accepts { framework_id, institution_id? }.
 */
export function useStartSubmission() {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: async (input: {
      framework_id: string
      institution_id?: string
    }) => {
      return await RegulatorySubmissionService.createSubmission({
        framework_id: input.framework_id,
        institution_id: input.institution_id || profile?.institution_id || '',
        academic_year: new Date().getFullYear().toString()
      })
    },
    onSuccess: () => {
      toast.success('Submission started')
      queryClient.invalidateQueries({ queryKey: submissionKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start submission')
    }
  })
}

// ---------------------------------------------------------------------------
// useCalculateScore — compute total weighted score for a submission
// Uses the service which also persists score to DB
// ---------------------------------------------------------------------------
export function useCalculateScore(submissionId: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: submissionKeys.score(submissionId),
    queryFn: () => RegulatorySubmissionService.calculateSubmissionScore(submissionId),
    enabled:
      !authLoading &&
      !!profile &&
      !!submissionId &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
