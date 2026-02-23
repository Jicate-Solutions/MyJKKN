// hooks/regulatory/use-peer-visits.ts
// React Query hooks for peer team visits (NAAC / NBA evaluation visits)

import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query'
import {
  RegulatoryPeerVisitService,
  type PeerVisitFilters,
  type CreatePeerVisitData,
  type UpdatePeerVisitData
} from '@/lib/services/regulatory/regulatory-peer-visit-service'
import { useAuth } from '../use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import { QUERY_CONFIG } from '@/lib/config/query-config'
import toast from 'react-hot-toast'
import { submissionKeys } from './use-submissions'

// ---------------------------------------------------------------------------
// Re-export service types for convenience
// ---------------------------------------------------------------------------
export type { PeerVisitFilters, CreatePeerVisitData, UpdatePeerVisitData }
export type { PeerTeamMember, PeerVisitActionItem } from '@/lib/services/regulatory/regulatory-peer-visit-service'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------
export const peerVisitKeys = {
  all: ['regulatory-peer-visits'] as const,
  lists: () => [...peerVisitKeys.all, 'list'] as const,
  listFor: (filters: PeerVisitFilters) =>
    [...peerVisitKeys.lists(), filters] as const,
  details: () => [...peerVisitKeys.all, 'detail'] as const,
  detail: (id: string) => [...peerVisitKeys.details(), id] as const
}

// ---------------------------------------------------------------------------
// usePeerVisits — list visits for institution (optionally filtered by submission)
// ---------------------------------------------------------------------------
export function usePeerVisits(
  filters: PeerVisitFilters = {}
): UseQueryResult<{ data: any[]; metadata: any }, Error> {
  const { profile, isLoading: authLoading } = useAuth()
  const { isSuperAdmin } = usePermissions()

  const resolvedInstitutionId =
    filters.institution_id ?? (isSuperAdmin ? undefined : profile?.institution_id)

  const resolvedFilters: PeerVisitFilters = {
    ...filters,
    institution_id: resolvedInstitutionId
  }

  return useQuery({
    queryKey: peerVisitKeys.listFor(resolvedFilters),
    queryFn: () => RegulatoryPeerVisitService.getPeerVisits(resolvedFilters),
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
    mutationFn: async (input: CreatePeerVisitData) => {
      return await RegulatoryPeerVisitService.createPeerVisit(input)
    },
    onSuccess: (_data, variables) => {
      toast.success('Peer visit scheduled')
      queryClient.invalidateQueries({ queryKey: peerVisitKeys.lists() })
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
    mutationFn: async (input: { id: string } & UpdatePeerVisitData) => {
      const { id, ...data } = input
      return await RegulatoryPeerVisitService.updatePeerVisit(id, data)
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
