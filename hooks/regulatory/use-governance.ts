// hooks/regulatory/use-governance.ts
// React Query hooks for governing bodies and meetings (IQAC, Board of Studies, etc.)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
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

  const resolvedFilters: GoverningBodyFilters = {
    ...filters,
    institution_id: resolvedInstitutionId
  }

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

  return useQuery({
    queryKey: governanceKeys.meetingsFor(filters),
    queryFn: () => RegulatoryGovernanceService.getMeetings(filters),
    enabled:
      !authLoading &&
      !!profile &&
      !!filters.body_id &&
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
    onSuccess: (_data, variables) => {
      toast.success('Meeting created')
      queryClient.invalidateQueries({ queryKey: governanceKeys.meetings() })
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
