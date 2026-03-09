import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ProgressionService } from '@/lib/services/startup-studio/progression-service'
import { useAuth } from '@/hooks/use-auth'

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useMyProgressionLevels() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['progression-levels', profile?.id],
    queryFn: () => ProgressionService.getMyProgressionLevels(profile!.id),
    enabled: !!profile?.id,
  })
}

export function useMyHighestLevelForEvent(eventId: string) {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['progression-level', eventId, profile?.id],
    queryFn: () => ProgressionService.getMyHighestLevelForEvent(profile!.id, eventId),
    enabled: !!profile?.id && isValidUUID(eventId),
  })
}

export function useEventProgressionLevels(eventId: string) {
  return useQuery({
    queryKey: ['event-progression-levels', eventId],
    queryFn: () => ProgressionService.getEventProgressionLevels(eventId),
    enabled: isValidUUID(eventId),
  })
}

export function useAutoAssignLevel1(eventId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => ProgressionService.autoAssignLevel1ForEvent(eventId),
    onSuccess: ({ assigned }) => {
      queryClient.invalidateQueries({ queryKey: ['event-progression-levels', eventId] })
      toast.success(`Level 1 (App Builder) assigned to ${assigned} learners.`)
    },
    onError: (error: Error) => {
      toast.error('Auto-assignment failed', { description: error.message })
    },
  })
}
