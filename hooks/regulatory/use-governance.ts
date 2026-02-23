// hooks/regulatory/use-governance.ts
// React Query hooks for governing bodies and meetings (IQAC, Board of Studies, etc.)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  RegulatoryGovernanceService,
  type GoverningBodyFilters,
  type CreateGoverningBodyData,
  type UpdateGoverningBodyData,
  type MeetingFilters,
  type CreateMeetingData,
  type UpdateMeetingData
} from '@/lib/services/regulatory/regulatory-governance-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type {
  GoverningBodyFilters,
  CreateGoverningBodyData,
  UpdateGoverningBodyData,
  MeetingFilters,
  CreateMeetingData,
  UpdateMeetingData
}
export type { GoverningBodyMember, MeetingResolution } from '@/lib/services/regulatory/regulatory-governance-service'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const governanceKeys = {
  all: ['regulatory-governance'] as const,
  bodies: () => [...governanceKeys.all, 'bodies'] as const,
  bodiesFor: (filters: GoverningBodyFilters) =>
    [...governanceKeys.bodies(), filters] as const,
  bodyDetail: (id: string) => [...governanceKeys.bodies(), 'detail', id] as const,
  meetings: () => [...governanceKeys.all, 'meetings'] as const,
  meetingsFor: (filters: MeetingFilters) =>
    [...governanceKeys.meetings(), filters] as const,
  meetingDetail: (id: string) => [...governanceKeys.meetings(), 'detail', id] as const
}

// ---------------------------------------------------------------------------
// useGoverningBodies — list governing bodies for an institution
// ---------------------------------------------------------------------------
export function useGoverningBodies(
  filters: GoverningBodyFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters = useMemo<GoverningBodyFilters>(
    () => ({
      ...filters,
      institution_id: resolvedInstitutionId
    }),
    [
      filters.institution_id,
      filters.body_type,
      filters.is_active,
      filters.page,
      filters.limit,
      resolvedInstitutionId
    ]
  )

  return useQuery({
    queryKey: governanceKeys.bodiesFor(resolvedFilters),
    queryFn: () => RegulatoryGovernanceService.getGoverningBodies(resolvedFilters),
    enabled:
      !authLoading &&
      !!profile &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useCreateGoverningBody — mutation
// ---------------------------------------------------------------------------
export function useCreateGoverningBody() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateGoverningBodyData) => {
      return await RegulatoryGovernanceService.createGoverningBody(input)
    },
    onSuccess: () => {
      toast.success('Governing body created')
      queryClient.invalidateQueries({ queryKey: governanceKeys.bodies() })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create governing body')
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdateGoverningBody — mutation
// ---------------------------------------------------------------------------
export function useUpdateGoverningBody() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string } & UpdateGoverningBodyData) => {
      const { id, ...data } = input
      return await RegulatoryGovernanceService.updateGoverningBody(id, data)
    },
    onSuccess: (data) => {
      toast.success('Governing body updated')
      queryClient.invalidateQueries({ queryKey: governanceKeys.bodies() })
      queryClient.invalidateQueries({
        queryKey: governanceKeys.bodyDetail(data.id)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update governing body')
    }
  })
}

// ---------------------------------------------------------------------------
// useMeetings — list meetings for a governing body
// ---------------------------------------------------------------------------
export function useMeetings(
  filters: MeetingFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedFilters = useMemo<MeetingFilters>(
    () => ({ ...filters }),
    [
      filters.body_id,
      filters.status,
      filters.from_date,
      filters.to_date,
      filters.page,
      filters.limit
    ]
  )

  return useQuery({
    queryKey: governanceKeys.meetingsFor(resolvedFilters),
    queryFn: () => RegulatoryGovernanceService.getMeetings(resolvedFilters),
    enabled:
      !authLoading &&
      !!profile &&
      !!resolvedFilters.body_id &&
      (isSuperAdmin || !!profile?.institution_id),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useCreateMeeting — mutation
// ---------------------------------------------------------------------------
export function useCreateMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateMeetingData) => {
      return await RegulatoryGovernanceService.createMeeting(input)
    },
    onSuccess: () => {
      toast.success('Meeting created')
      // Invalidate all governance queries (including adapter key 'all-meetings')
      queryClient.invalidateQueries({ queryKey: governanceKeys.all })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create meeting')
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdateMeeting — mutation
// ---------------------------------------------------------------------------
export function useUpdateMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string } & UpdateMeetingData) => {
      const { id, ...data } = input
      return await RegulatoryGovernanceService.updateMeeting(id, data)
    },
    onSuccess: (data) => {
      toast.success('Meeting updated')
      queryClient.invalidateQueries({ queryKey: governanceKeys.meetings() })
      queryClient.invalidateQueries({
        queryKey: governanceKeys.meetingDetail(data.id)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update meeting')
    }
  })
}

// ---------------------------------------------------------------------------
// Adapter hooks (used by governance page with simpler signatures)
// ---------------------------------------------------------------------------

/**
 * useGoverningMeetings — all meetings for an institution (across all bodies).
 * Accepts { institution_id? }. Returns flat array.
 */
export function useGoverningMeetings(
  opts: { institution_id?: string } = {}
) {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const institutionId = opts.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery<any[], Error>({
    queryKey: [...governanceKeys.all, 'all-meetings', institutionId] as const,
    queryFn: async () => {
      try {
        const { createClientSupabaseClient } = await import('@/lib/supabase/client')
        const supabase = createClientSupabaseClient()

        let query = (supabase as any)
          .from('regulatory_body_meetings')
          .select('*, body:regulatory_governing_bodies(id, name, body_type)')

        if (institutionId) {
          query = query.eq('institution_id', institutionId)
        }

        const { data, error } = await query
          .order('meeting_date', { ascending: false })
          .limit(200) // Safety cap: prevent unbounded fetches

        if (error) throw error

        return (data || []).map((m: any) => ({
          ...m,
          body_name: m.body?.name || '',
          body_id: m.body?.id || m.body_id
        }))
      } catch (error) {
        console.error('[useGoverningMeetings] Error:', error)
        return []
      }
    },
    enabled:
      !authLoading &&
      !!profile &&
      (isSuperAdmin || !!institutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}
