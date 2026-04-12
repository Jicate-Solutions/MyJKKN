import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Solve100WeeklyCheckinService } from '@/lib/services/startup-studio/solve100-weekly-checkin-service'
import { useAuth } from '@/hooks/use-auth'
import { isValidUUID } from '@/lib/constants/startup-studio/solve100'
import type { SubmitWeeklyCheckinDto, MentorReviewDto } from '@/types/startup-studio'

// ── Queries ──────────────────────────────────────────────────

export function useMyWeeklyCheckin(eventId: string, teamId: string | null | undefined, week: number) {
  return useQuery({
    queryKey: ['solve100-checkin', eventId, teamId, week],
    queryFn: () => Solve100WeeklyCheckinService.getMyCheckin(eventId, teamId!, week),
    enabled: isValidUUID(eventId) && isValidUUID(teamId) && week > 0,
  })
}

export function useTeamHistory(eventId: string, teamId: string | null | undefined) {
  return useQuery({
    queryKey: ['solve100-team-history', eventId, teamId],
    queryFn: () => Solve100WeeklyCheckinService.getTeamHistory(eventId, teamId!),
    enabled: isValidUUID(eventId) && isValidUUID(teamId),
  })
}

export function useWeeklyOverview(eventId: string, week: number) {
  return useQuery({
    queryKey: ['solve100-weekly-overview', eventId, week],
    queryFn: () => Solve100WeeklyCheckinService.getEventWeeklyOverview(eventId, week),
    enabled: isValidUUID(eventId) && week > 0,
  })
}

export function useSolve100Dashboard(eventId: string) {
  return useQuery({
    queryKey: ['solve100-dashboard', eventId],
    queryFn: () => Solve100WeeklyCheckinService.getEventDashboard(eventId),
    enabled: isValidUUID(eventId),
    staleTime: 30 * 1000,
  })
}

export function useSolve100TeamOverviews(eventId: string) {
  return useQuery({
    queryKey: ['solve100-team-overviews', eventId],
    queryFn: () => Solve100WeeklyCheckinService.getTeamOverviews(eventId),
    enabled: isValidUUID(eventId),
    staleTime: 30 * 1000,
  })
}

export function useUnreviewedCheckins(eventId: string) {
  return useQuery({
    queryKey: ['solve100-unreviewed', eventId],
    queryFn: () => Solve100WeeklyCheckinService.getUnreviewedCheckins(eventId),
    enabled: isValidUUID(eventId),
  })
}

// ── Mutations ────────────────────────────────────────────────

export function useSubmitWeeklyCheckin(eventId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: (dto: SubmitWeeklyCheckinDto) =>
      Solve100WeeklyCheckinService.submitCheckin(dto, profile!.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['solve100-checkin', eventId] })
      queryClient.invalidateQueries({ queryKey: ['solve100-team-history', eventId, data.team_id] })
      queryClient.invalidateQueries({ queryKey: ['solve100-weekly-overview', eventId] })
      queryClient.invalidateQueries({ queryKey: ['solve100-dashboard', eventId] })
      queryClient.invalidateQueries({ queryKey: ['solve100-team-overviews', eventId] })
      toast.success('Weekly check-in submitted!')
    },
    onError: (error: Error) => {
      toast.error('Failed to submit check-in', { description: error.message })
    },
  })
}

export function useMentorReview(eventId: string) {
  const queryClient = useQueryClient()
  const { profile } = useAuth()

  return useMutation({
    mutationFn: ({ checkinId, dto }: { checkinId: string; dto: MentorReviewDto }) =>
      Solve100WeeklyCheckinService.mentorReview(checkinId, dto, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solve100-unreviewed', eventId] })
      queryClient.invalidateQueries({ queryKey: ['solve100-weekly-overview', eventId] })
      toast.success('Review saved')
    },
    onError: (error: Error) => {
      toast.error('Failed to save review', { description: error.message })
    },
  })
}
