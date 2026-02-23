// hooks/regulatory/use-benchmarks.ts
// React Query hooks for peer institution benchmark comparisons (NAAC 6.5.3)

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
import { friendlyErrorMessage } from '@/lib/utils/toast-error'
import type {
  RegulatoryPeerBenchmarkRow,
  RegulatoryPeerBenchmarkInsert,
  RegulatoryPeerBenchmarkUpdate,
  RegulatoryPeerBenchmarkFilters,
  PeerBenchmarkSummary
} from '@/types/regulatory.types'

// ---------------------------------------------------------------------------
// Re-export types for convenience
// ---------------------------------------------------------------------------
export type {
  RegulatoryPeerBenchmarkRow,
  RegulatoryPeerBenchmarkInsert,
  RegulatoryPeerBenchmarkUpdate,
  RegulatoryPeerBenchmarkFilters,
  PeerBenchmarkSummary
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const benchmarkKeys = {
  all: ['regulatory-benchmarks'] as const,
  lists: () => [...benchmarkKeys.all, 'list'] as const,
  listFor: (filters: RegulatoryPeerBenchmarkFilters) =>
    [...benchmarkKeys.lists(), filters] as const,
  details: () => [...benchmarkKeys.all, 'detail'] as const,
  detail: (id: string) => [...benchmarkKeys.details(), id] as const,
  summaries: () => [...benchmarkKeys.all, 'summary'] as const,
  summaryFor: (frameworkId: string, institutionId?: string, academicYear?: string) =>
    [...benchmarkKeys.summaries(), frameworkId, institutionId, academicYear] as const
}

// ---------------------------------------------------------------------------
// usePeerBenchmarks — list benchmarks with filters and pagination
// ---------------------------------------------------------------------------
export function usePeerBenchmarks(
  filters: RegulatoryPeerBenchmarkFilters = {}
): UseQueryResult<{ data: RegulatoryPeerBenchmarkRow[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<RegulatoryPeerBenchmarkFilters>(
    () => ({
      ...filters,
      institution_id: resolvedInstitutionId
    }),
    [
      resolvedInstitutionId,
      filters.framework_id,
      filters.academic_year,
      filters.peer_institution_name,
      filters.metric_code,
      filters.page,
      filters.limit
    ]
  )

  const queryKey = useMemo(() => benchmarkKeys.listFor(resolvedFilters), [resolvedFilters])

  const queryFn = useCallback(async () => {
    let query = (getSupabase() as any)
      .from('regulatory_peer_benchmarks')
      .select('*', { count: 'exact' })

    if (resolvedFilters.institution_id) {
      query = query.eq('institution_id', resolvedFilters.institution_id)
    }
    if (resolvedFilters.framework_id) {
      query = query.eq('framework_id', resolvedFilters.framework_id)
    }
    if (resolvedFilters.academic_year) {
      query = query.eq('academic_year', resolvedFilters.academic_year)
    }
    if (resolvedFilters.peer_institution_name) {
      query = query.ilike('peer_institution_name', `%${resolvedFilters.peer_institution_name}%`)
    }
    if (resolvedFilters.metric_code) {
      query = query.eq('metric_code', resolvedFilters.metric_code)
    }

    const page = resolvedFilters.page || 1
    const limit = resolvedFilters.limit || 50
    const from = (page - 1) * limit
    query = query
      .range(from, from + limit - 1)
      .order('peer_institution_name', { ascending: true })
      .order('metric_code', { ascending: true })

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
  }, [resolvedFilters])

  return useQuery({
    queryKey,
    queryFn,
    enabled:
      !authLoading &&
      !!profile &&
      (isSuperAdmin || !!resolvedInstitutionId),
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// usePeerBenchmark — single benchmark by ID
// ---------------------------------------------------------------------------
export function usePeerBenchmark(id: string): UseQueryResult<RegulatoryPeerBenchmarkRow, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: benchmarkKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      if (!data) throw new Error('Peer benchmark not found')
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
// usePeerBenchmarkSummary — aggregated gap analysis per peer institution
// ---------------------------------------------------------------------------
export function usePeerBenchmarkSummary(
  frameworkId: string,
  institutionId?: string,
  academicYear?: string
): UseQueryResult<PeerBenchmarkSummary[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: benchmarkKeys.summaryFor(frameworkId, resolvedInstitutionId, academicYear),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .select('*')
        .eq('framework_id', frameworkId)

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }
      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      query = query.limit(1000) // Safety cap: prevent unbounded fetches

      const { data, error } = await query

      if (error) throw error

      // Aggregate by peer institution
      const peerMap = new Map<string, {
        name: string
        nirf_rank: number | null
        naac_grade: string | null
        metrics: { gap: number }[]
      }>()

      for (const row of (data || []) as RegulatoryPeerBenchmarkRow[]) {
        const key = row.peer_institution_name
        if (!peerMap.has(key)) {
          peerMap.set(key, {
            name: row.peer_institution_name,
            nirf_rank: row.peer_institution_nirf_rank,
            naac_grade: row.peer_institution_naac_grade,
            metrics: []
          })
        }
        if (row.gap !== null) {
          peerMap.get(key)!.metrics.push({ gap: row.gap })
        }
      }

      const summaries: PeerBenchmarkSummary[] = Array.from(peerMap.values()).map((peer) => {
        const metricsCompared = peer.metrics.length
        const metricsLeading = peer.metrics.filter((m) => m.gap > 0).length
        const metricsLagging = peer.metrics.filter((m) => m.gap < 0).length
        const avgGap = metricsCompared > 0
          ? Math.round((peer.metrics.reduce((sum, m) => sum + m.gap, 0) / metricsCompared) * 100) / 100
          : 0

        return {
          peer_institution_name: peer.name,
          peer_institution_nirf_rank: peer.nirf_rank,
          peer_institution_naac_grade: peer.naac_grade,
          metrics_compared: metricsCompared,
          metrics_leading: metricsLeading,
          metrics_lagging: metricsLagging,
          avg_gap: avgGap
        }
      })

      return summaries.sort((a, b) => b.avg_gap - a.avg_gap)
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
// useCreatePeerBenchmark — mutation to insert a new peer benchmark record
// ---------------------------------------------------------------------------
export function useCreatePeerBenchmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RegulatoryPeerBenchmarkInsert) => {
      // Get current user for created_by
      const { data: { user } } = await getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await (getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .insert({
          ...input,
          created_by: input.created_by || user.id
        })
        .select()
        .single()

      if (error) throw error
      return data as RegulatoryPeerBenchmarkRow
    },
    onSuccess: () => {
      toast.success('Peer benchmark added')
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.lists() })
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.summaries() })
    },
    onError: (error: Error) => {
      toast.error(friendlyErrorMessage(error, 'Failed to add peer benchmark'))
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdatePeerBenchmark — mutation to update a peer benchmark record
// ---------------------------------------------------------------------------
export function useUpdatePeerBenchmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RegulatoryPeerBenchmarkUpdate) => {
      const { id, ...updates } = input

      const { data, error } = await (getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as RegulatoryPeerBenchmarkRow
    },
    onSuccess: (data) => {
      toast.success('Peer benchmark updated')
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.lists() })
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.detail(data.id) })
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.summaries() })
    },
    onError: (error: Error) => {
      toast.error(friendlyErrorMessage(error, 'Failed to update peer benchmark'))
    }
  })
}

// ---------------------------------------------------------------------------
// useDeletePeerBenchmark — mutation to delete a peer benchmark record
// ---------------------------------------------------------------------------
export function useDeletePeerBenchmark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { id }
    },
    onSuccess: () => {
      toast.success('Peer benchmark deleted')
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.lists() })
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.summaries() })
    },
    onError: (error: Error) => {
      toast.error(friendlyErrorMessage(error, 'Failed to delete peer benchmark'))
    }
  })
}

// ---------------------------------------------------------------------------
// useBulkCreatePeerBenchmarks — mutation to insert multiple benchmarks at once
// ---------------------------------------------------------------------------
export function useBulkCreatePeerBenchmarks() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inputs: RegulatoryPeerBenchmarkInsert[]) => {
      if (inputs.length === 0) return []

      // Get current user for created_by
      const { data: { user } } = await getSupabase().auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const rows = inputs.map((input) => ({
        ...input,
        created_by: input.created_by || user.id
      }))

      const { data, error } = await (getSupabase() as any)
        .from('regulatory_peer_benchmarks')
        .insert(rows)
        .select()

      if (error) throw error
      return (data || []) as RegulatoryPeerBenchmarkRow[]
    },
    onSuccess: (data) => {
      toast.success(`${data.length} peer benchmark(s) added`)
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.lists() })
      queryClient.invalidateQueries({ queryKey: benchmarkKeys.summaries() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add peer benchmarks')
    }
  })
}
