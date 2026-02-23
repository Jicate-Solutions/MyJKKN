// hooks/regulatory/use-governance.ts
// React Query hooks for governing bodies and meetings (IQAC, Board of Studies, etc.)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import { createClientSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreateGoverningBodyInput {
  institution_id: string
  name: string
  body_type: string
  description?: string
  chairperson?: string
  members?: Record<string, any>[]
  mandate?: string
  created_by?: string
}

export interface UpdateGoverningBodyInput {
  id: string
  name?: string
  body_type?: string
  description?: string
  chairperson?: string
  members?: Record<string, any>[]
  mandate?: string
  is_active?: boolean
  updated_by?: string
}

export interface CreateMeetingInput {
  governing_body_id: string
  institution_id: string
  title: string
  meeting_date: string
  academic_year?: string
  venue?: string
  agenda?: string
  minutes?: string
  attendees?: Record<string, any>[]
  action_items?: Record<string, any>[]
  status?: string
  created_by?: string
}

export interface UpdateMeetingInput {
  id: string
  title?: string
  meeting_date?: string
  venue?: string
  agenda?: string
  minutes?: string
  attendees?: Record<string, any>[]
  action_items?: Record<string, any>[]
  status?: string
  updated_by?: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const governanceKeys = {
  all: ['regulatory-governance'] as const,
  bodies: () => [...governanceKeys.all, 'bodies'] as const,
  bodiesFor: (institutionId?: string, bodyType?: string) =>
    [...governanceKeys.bodies(), institutionId, bodyType] as const,
  bodyDetail: (id: string) => [...governanceKeys.bodies(), 'detail', id] as const,
  meetings: () => [...governanceKeys.all, 'meetings'] as const,
  meetingsFor: (bodyId: string, academicYear?: string) =>
    [...governanceKeys.meetings(), bodyId, academicYear] as const,
  meetingDetail: (id: string) => [...governanceKeys.meetings(), 'detail', id] as const
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// useGoverningBodies — list governing bodies for an institution
// ---------------------------------------------------------------------------
export function useGoverningBodies(
  institutionId?: string,
  bodyType?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: governanceKeys.bodiesFor(resolvedInstitutionId, bodyType),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_governing_bodies')
        .select('*')

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }
      if (bodyType) {
        query = query.eq('body_type', bodyType)
      }

      const { data, error } = await query.order('name', { ascending: true })

      if (error) throw error
      return data || []
    },
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
    mutationFn: async (input: CreateGoverningBodyInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_governing_bodies')
        .insert({
          institution_id: input.institution_id,
          name: input.name,
          body_type: input.body_type,
          description: input.description,
          chairperson: input.chairperson,
          members: input.members || [],
          mandate: input.mandate,
          created_by: input.created_by
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
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
    mutationFn: async (input: UpdateGoverningBodyInput) => {
      const { id, ...updates } = input
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_governing_bodies')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
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
  bodyId: string,
  academicYear?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  return useQuery({
    queryKey: governanceKeys.meetingsFor(bodyId, academicYear),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_meetings')
        .select('*')
        .eq('governing_body_id', bodyId)

      if (academicYear) {
        query = query.eq('academic_year', academicYear)
      }

      const { data, error } = await query.order('meeting_date', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled:
      !authLoading &&
      !!profile &&
      !!bodyId &&
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
    mutationFn: async (input: CreateMeetingInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_meetings')
        .insert({
          governing_body_id: input.governing_body_id,
          institution_id: input.institution_id,
          title: input.title,
          meeting_date: input.meeting_date,
          academic_year: input.academic_year,
          venue: input.venue,
          agenda: input.agenda,
          minutes: input.minutes,
          attendees: input.attendees || [],
          action_items: input.action_items || [],
          status: input.status || 'scheduled',
          created_by: input.created_by
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      toast.success('Meeting created')
      queryClient.invalidateQueries({
        queryKey: governanceKeys.meetingsFor(variables.governing_body_id)
      })
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
    mutationFn: async (input: UpdateMeetingInput) => {
      const { id, ...updates } = input

      // Fetch the meeting first to get governing_body_id for invalidation
      const { data: existing } = await (getSupabase() as any)
        .from('regulatory_meetings')
        .select('governing_body_id')
        .eq('id', id)
        .maybeSingle()

      const { data, error } = await (getSupabase() as any)
        .from('regulatory_meetings')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return { ...data, _governing_body_id: existing?.governing_body_id }
    },
    onSuccess: (data) => {
      toast.success('Meeting updated')
      if (data._governing_body_id) {
        queryClient.invalidateQueries({
          queryKey: governanceKeys.meetingsFor(data._governing_body_id)
        })
      }
      queryClient.invalidateQueries({
        queryKey: governanceKeys.meetingDetail(data.id)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update meeting')
    }
  })
}
