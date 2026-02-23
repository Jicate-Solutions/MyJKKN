// hooks/regulatory/use-submissions.ts
// React Query hooks for regulatory submissions and workflow

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
import { metricKeys } from './use-metrics'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SubmissionFilters {
  framework_id?: string
  institution_id?: string
  academic_year?: string
  status?: string
  page?: number
  limit?: number
}

export interface CreateSubmissionInput {
  framework_id: string
  institution_id: string
  academic_year: string
  title?: string
  notes?: string
  created_by: string
}

export interface UpdateSubmissionStatusInput {
  id: string
  status: string
  notes?: string
  updated_by: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const submissionKeys = {
  all: ['regulatory-submissions'] as const,
  lists: () => [...submissionKeys.all, 'list'] as const,
  list: (filters: SubmissionFilters) => [...submissionKeys.lists(), filters] as const,
  details: () => [...submissionKeys.all, 'detail'] as const,
  detail: (id: string) => [...submissionKeys.details(), id] as const,
  scores: () => [...submissionKeys.all, 'score'] as const,
  score: (submissionId: string) => [...submissionKeys.scores(), submissionId] as const
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// useSubmissions — list by framework / institution / year
// ---------------------------------------------------------------------------
export function useSubmissions(
  filters: SubmissionFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<SubmissionFilters>(
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
    try {
      let query = (getSupabase() as any)
        .from('regulatory_submissions')
        .select('*', { count: 'exact' })

      if (resolvedFilters.framework_id) {
        query = query.eq('framework_id', resolvedFilters.framework_id)
      }
      if (resolvedFilters.institution_id) {
        query = query.eq('institution_id', resolvedFilters.institution_id)
      }
      if (resolvedFilters.academic_year) {
        query = query.eq('academic_year', resolvedFilters.academic_year)
      }
      if (resolvedFilters.status) {
        query = query.eq('status', resolvedFilters.status)
      }

      const page = resolvedFilters.page || 1
      const limit = resolvedFilters.limit || 20
      const from = (page - 1) * limit
      query = query
        .range(from, from + limit - 1)
        .order('created_at', { ascending: false })

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
      console.error('[useSubmissions] Fetch Error:', error)
      throw new Error('Failed to fetch submissions')
    }
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
// useSubmission — single submission with stats
// ---------------------------------------------------------------------------
export function useSubmission(id: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: submissionKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_submissions')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Submission not found')
      return data
    },
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
    mutationFn: async (input: CreateSubmissionInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_submissions')
        .insert({
          framework_id: input.framework_id,
          institution_id: input.institution_id,
          academic_year: input.academic_year,
          title: input.title,
          notes: input.notes,
          status: 'draft',
          created_by: input.created_by
        })
        .select()
        .single()

      if (error) throw error
      return data
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
    mutationFn: async (input: UpdateSubmissionStatusInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_submissions')
        .update({
          status: input.status,
          notes: input.notes,
          updated_by: input.updated_by,
          updated_at: new Date().toISOString()
        })
        .eq('id', input.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      const statusLabel =
        data.status === 'submitted'
          ? 'Submitted'
          : data.status === 'approved'
          ? 'Approved'
          : data.status === 'rejected'
          ? 'Returned for revision'
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
// useCalculateScore — compute total weighted score for a submission
// ---------------------------------------------------------------------------
export function useCalculateScore(submissionId: string): UseQueryResult<any, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: submissionKeys.score(submissionId),
    queryFn: async () => {
      // Get submission to find framework + institution + year
      const { data: submission, error: subError } = await (getSupabase() as any)
        .from('regulatory_submissions')
        .select('*')
        .eq('id', submissionId)
        .maybeSingle()

      if (subError) throw subError
      if (!submission) throw new Error('Submission not found')

      // Get all criteria for the framework
      const { data: criteria, error: critError } = await (getSupabase() as any)
        .from('regulatory_criteria')
        .select('id, max_score, weightage')
        .eq('framework_id', submission.framework_id)

      if (critError) throw critError

      const criteriaIds = (criteria || []).map((c: any) => c.id)
      if (criteriaIds.length === 0) {
        return {
          submission_id: submissionId,
          total_score: 0,
          max_possible: 0,
          percentage: 0,
          criteria_scores: []
        }
      }

      // Get all metric values for this submission scope
      const { data: metricValues, error: mvError } = await (getSupabase() as any)
        .from('regulatory_metric_values')
        .select('metric_id, numeric_value')
        .eq('framework_id', submission.framework_id)
        .eq('institution_id', submission.institution_id)
        .eq('academic_year', submission.academic_year)

      if (mvError) throw mvError

      // Get metrics with their criteria mapping + max score
      const { data: metrics, error: mError } = await (getSupabase() as any)
        .from('regulatory_metrics')
        .select('id, criteria_id, max_score')
        .in('criteria_id', criteriaIds)

      if (mError) throw mError

      // Build score breakdown by criteria
      const valueMap = new Map(
        (metricValues || []).map((v: any) => [v.metric_id, v.numeric_value || 0])
      )

      const criteriaScores = (criteria || []).map((crit: any) => {
        const critMetrics = (metrics || []).filter((m: any) => m.criteria_id === crit.id)
        const totalObtained = critMetrics.reduce(
          (sum: number, m: any) => sum + (valueMap.get(m.id) || 0),
          0
        )
        const maxPossible = critMetrics.reduce(
          (sum: number, m: any) => sum + (m.max_score || 0),
          0
        )
        return {
          criteria_id: crit.id,
          obtained: totalObtained,
          max_possible: maxPossible,
          weightage: crit.weightage || 1
        }
      })

      const totalScore = criteriaScores.reduce((sum: number, cs: any) => sum + cs.obtained, 0)
      const maxPossible = criteriaScores.reduce((sum: number, cs: any) => sum + cs.max_possible, 0)
      const percentage = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0

      return {
        submission_id: submissionId,
        total_score: totalScore,
        max_possible: maxPossible,
        percentage,
        criteria_scores: criteriaScores
      }
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!submissionId &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
