import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Solve100ICPService } from '@/lib/services/startup-studio/solve100-icp-service'
import { useAuth } from '@/hooks/use-auth'
import type { CreateICPDto, UpdateICPDto } from '@/types/startup-studio'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isValidUUID = (id: string | undefined | null): boolean =>
  !!id && !id.includes('%%drp:') && UUID_REGEX.test(id)

// ── Queries ──────────────────────────────────────────────────

export function useMyICP(eventId: string, teamId: string | null | undefined) {
  return useQuery({
    queryKey: ['solve100-icp', eventId, teamId],
    queryFn: () => Solve100ICPService.getMyICP(eventId, teamId!),
    enabled: isValidUUID(eventId) && isValidUUID(teamId),
  })
}

export function useEventICPs(eventId: string) {
  return useQuery({
    queryKey: ['solve100-event-icps', eventId],
    queryFn: () => Solve100ICPService.getEventICPs(eventId),
    enabled: isValidUUID(eventId),
    staleTime: 30 * 1000,
  })
}

// ── Mutations ────────────────────────────────────────────────

export function useSubmitICP(eventId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: (dto: CreateICPDto) =>
      Solve100ICPService.createICP(dto, profile!.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['solve100-icp', eventId, data.team_id] })
      queryClient.invalidateQueries({ queryKey: ['solve100-event-icps', eventId] })
      queryClient.invalidateQueries({ queryKey: ['solve100-team-overviews', eventId] })
      toast.success('ICP profile saved!')
    },
    onError: (error: Error) => {
      toast.error('Failed to save ICP', { description: error.message })
    },
  })
}

export function useUpdateICP(eventId: string, teamId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateICPDto }) =>
      Solve100ICPService.updateICP(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solve100-icp', eventId, teamId] })
      queryClient.invalidateQueries({ queryKey: ['solve100-event-icps', eventId] })
      toast.success('ICP updated (new version saved)')
    },
    onError: (error: Error) => {
      toast.error('Failed to update ICP', { description: error.message })
    },
  })
}
