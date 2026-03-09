import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { TrackDeclarationService } from '@/lib/services/startup-studio/track-declaration-service'
import { useAuth } from '@/hooks/use-auth'
import type {
  DeclareTrackDto,
  UpdateTrackDeclarationDto,
  MentorApproveTrackDto,
} from '@/types/startup-studio'

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useMyDeclaration(eventId: string, registrationId: string | null | undefined) {
  return useQuery({
    queryKey: ['track-declaration', eventId, registrationId],
    queryFn: () => TrackDeclarationService.getMyDeclaration(eventId, registrationId!),
    enabled: isValidUUID(eventId) && isValidUUID(registrationId),
  })
}

export function useEventDeclarations(eventId: string) {
  return useQuery({
    queryKey: ['event-track-declarations', eventId],
    queryFn: () => TrackDeclarationService.getEventDeclarations(eventId),
    enabled: isValidUUID(eventId),
  })
}

export function useDeclarationSummary(eventId: string) {
  return useQuery({
    queryKey: ['track-declaration-summary', eventId],
    queryFn: () => TrackDeclarationService.getDeclarationSummary(eventId),
    enabled: isValidUUID(eventId),
  })
}

export function useDeclareTrack(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: (dto: DeclareTrackDto) =>
      TrackDeclarationService.declareTrack(dto, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['track-declaration', eventId, registrationId] })
      queryClient.invalidateQueries({ queryKey: ['event-track-declarations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['track-declaration-summary', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to submit declaration', { description: error.message })
    },
  })
}

export function useUpdateTrackDeclaration(eventId: string, registrationId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTrackDeclarationDto }) =>
      TrackDeclarationService.updateDeclaration(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['track-declaration', eventId, registrationId] })
      queryClient.invalidateQueries({ queryKey: ['event-track-declarations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['track-declaration-summary', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to update declaration', { description: error.message })
    },
  })
}

export function useMentorApproveDeclaration(eventId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: MentorApproveTrackDto }) =>
      TrackDeclarationService.mentorApprove(id, dto, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-track-declarations', eventId] })
      queryClient.invalidateQueries({ queryKey: ['track-declaration-summary', eventId] })
    },
    onError: (error: Error) => {
      toast.error('Failed to update approval', { description: error.message })
    },
  })
}
