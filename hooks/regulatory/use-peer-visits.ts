// hooks/regulatory/use-peer-visits.ts
// React Query hooks for peer team visits (NAAC / NBA evaluation visits)

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
import { submissionKeys } from './use-submissions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CreatePeerVisitInput {
  institution_id: string
  submission_id?: string
  framework_id?: string
  visit_type?: string
  scheduled_start: string
  scheduled_end: string
  team_members?: Record<string, any>[]
  agenda?: string
  logistics_notes?: string
  status?: string
  created_by?: string
}

export interface UpdatePeerVisitInput {
  id: string
  visit_type?: string
  scheduled_start?: string
  scheduled_end?: string
  actual_start?: string
  actual_end?: string
  team_members?: Record<string, any>[]
  agenda?: string
  logistics_notes?: string
  findings?: string
  recommendations?: string
  score_awarded?: number
  status?: string
  updated_by?: string
}

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const peerVisitKeys = {
  all: ['regulatory-peer-visits'] as const,
  lists: () => [...peerVisitKeys.all, 'list'] as const,
  listFor: (institutionId?: string, submissionId?: string) =>
    [...peerVisitKeys.lists(), institutionId, submissionId] as const,
  details: () => [...peerVisitKeys.all, 'detail'] as const,
  detail: (id: string) => [...peerVisitKeys.details(), id] as const
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function getSupabase() {
  return createClientSupabaseClient()
}

// ---------------------------------------------------------------------------
// usePeerVisits — list visits for institution (optionally filtered by submission)
// ---------------------------------------------------------------------------
export function usePeerVisits(
  institutionId?: string,
  submissionId?: string
): UseQueryResult<any[], Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    institutionId ?? (isSuperAdmin ? undefined : profile?.institution_id)

  return useQuery({
    queryKey: peerVisitKeys.listFor(resolvedInstitutionId, submissionId),
    queryFn: async () => {
      let query = (getSupabase() as any)
        .from('regulatory_peer_visits')
        .select('*')

      if (resolvedInstitutionId) {
        query = query.eq('institution_id', resolvedInstitutionId)
      }
      if (submissionId) {
        query = query.eq('submission_id', submissionId)
      }

      const { data, error } = await query.order('scheduled_start', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled:
      !authLoading &&
      !!profile &&
      (isSuperAdmin || !!resolvedInstitutionId),
    ...QUERY_CONFIG.SEMI_STABLE_DATA
  })
}

// ---------------------------------------------------------------------------
// useCreatePeerVisit — mutation
// ---------------------------------------------------------------------------
export function useCreatePeerVisit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreatePeerVisitInput) => {
      const { data, error } = await (getSupabase() as any)
        .from('regulatory_peer_visits')
        .insert({
          institution_id: input.institution_id,
          submission_id: input.submission_id,
          framework_id: input.framework_id,
          visit_type: input.visit_type,
          scheduled_start: input.scheduled_start,
          scheduled_end: input.scheduled_end,
          team_members: input.team_members || [],
          agenda: input.agenda,
          logistics_notes: input.logistics_notes,
          status: input.status || 'scheduled',
          created_by: input.created_by
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      toast.success('Peer visit scheduled')
      queryClient.invalidateQueries({
        queryKey: peerVisitKeys.listFor(variables.institution_id, variables.submission_id)
      })
      if (variables.submission_id) {
        queryClient.invalidateQueries({
          queryKey: submissionKeys.detail(variables.submission_id)
        })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to schedule peer visit')
    }
  })
}

// ---------------------------------------------------------------------------
// useUpdatePeerVisit — mutation
// ---------------------------------------------------------------------------
export function useUpdatePeerVisit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdatePeerVisitInput) => {
      const { id, ...updates } = input

      const { data, error } = await (getSupabase() as any)
        .from('regulatory_peer_visits')
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
      toast.success('Peer visit updated')
      queryClient.invalidateQueries({ queryKey: peerVisitKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: peerVisitKeys.detail(data.id)
      })
      if (data.submission_id) {
        queryClient.invalidateQueries({
          queryKey: submissionKeys.detail(data.submission_id)
        })
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update peer visit')
    }
  })
}
