// hooks/startup-studio/use-solve100-weekly.ts
// React Query hooks for Solve for 100 weekly check-ins.
// Spec: docs/SPEC-solve-for-100.md
// Added: 2026-04-14

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Solve100WeeklyCheckinService } from '@/lib/services/startup-studio/solve100-weekly-checkin-service';
import { useAuth } from '@/hooks/use-auth';
import type {
  CreateWeeklyCheckinDto,
  UpdateWeeklyCheckinDto,
  MentorReviewDto,
} from '@/types/startup-studio';

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean =>
  !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

/** Fetch the current team's check-in for a specific week. */
export function useMyWeeklyCheckin(
  eventId: string,
  teamId: string | null | undefined,
  weekNumber: number | null | undefined
) {
  return useQuery({
    queryKey: ['solve100-weekly-checkin', eventId, teamId, weekNumber],
    queryFn: () =>
      Solve100WeeklyCheckinService.getMyCheckin(eventId, teamId!, weekNumber!),
    enabled:
      isValidUUID(eventId) &&
      isValidUUID(teamId) &&
      typeof weekNumber === 'number' &&
      weekNumber >= 1,
  });
}

/** Submit (insert) a new weekly check-in. */
export function useSubmitWeeklyCheckin(eventId: string, teamId: string) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: CreateWeeklyCheckinDto) =>
      Solve100WeeklyCheckinService.submitCheckin(dto, profile!.id),
    onSuccess: data => {
      queryClient.invalidateQueries({
        queryKey: ['solve100-weekly-checkin', eventId, teamId, data.week_number],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-team-history', eventId, teamId],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-weekly-overview', eventId, data.week_number],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-dashboard', eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-unreviewed', eventId],
      });
      toast.success('Weekly check-in submitted');
    },
    onError: (error: Error) => {
      toast.error('Failed to submit check-in', { description: error.message });
    },
  });
}

/** Update an existing check-in (e.g. add commitment_result later in the week). */
export function useUpdateWeeklyCheckin(eventId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateWeeklyCheckinDto }) =>
      Solve100WeeklyCheckinService.updateCheckin(id, dto),
    onSuccess: data => {
      queryClient.invalidateQueries({
        queryKey: ['solve100-weekly-checkin', eventId, teamId, data.week_number],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-team-history', eventId, teamId],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-weekly-overview', eventId, data.week_number],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-dashboard', eventId],
      });
      toast.success('Check-in updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update check-in', { description: error.message });
    },
  });
}

/** All check-ins for one team across the program (time-series). */
export function useTeamHistory(
  eventId: string,
  teamId: string | null | undefined
) {
  return useQuery({
    queryKey: ['solve100-team-history', eventId, teamId],
    queryFn: () =>
      Solve100WeeklyCheckinService.getTeamHistory(eventId, teamId!),
    enabled: isValidUUID(eventId) && isValidUUID(teamId),
  });
}

/** All teams' check-ins for a given week (admin/mentor overview). */
export function useWeeklyOverview(
  eventId: string,
  weekNumber: number | null | undefined
) {
  return useQuery({
    queryKey: ['solve100-weekly-overview', eventId, weekNumber],
    queryFn: () =>
      Solve100WeeklyCheckinService.getEventWeeklyOverview(
        eventId,
        weekNumber!
      ),
    enabled:
      isValidUUID(eventId) &&
      typeof weekNumber === 'number' &&
      weekNumber >= 1,
  });
}

/** Aggregate metrics for the Solve for 100 hub page. */
export function useSolve100Dashboard(eventId: string) {
  return useQuery({
    queryKey: ['solve100-dashboard', eventId],
    queryFn: () => Solve100WeeklyCheckinService.getEventDashboard(eventId),
    enabled: isValidUUID(eventId),
  });
}

/** Mentor marks a check-in as reviewed. */
export function useMentorReview(eventId: string) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: MentorReviewDto }) =>
      Solve100WeeklyCheckinService.mentorReview(id, dto, profile!.id),
    onSuccess: data => {
      queryClient.invalidateQueries({
        queryKey: ['solve100-unreviewed', eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-team-history', eventId, data.team_id],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-weekly-checkin', eventId, data.team_id, data.week_number],
      });
      toast.success('Check-in reviewed');
    },
    onError: (error: Error) => {
      toast.error('Failed to mark as reviewed', {
        description: error.message,
      });
    },
  });
}

/**
 * Check-ins waiting on mentor review. When the current user is a mentor, the
 * service narrows the result to their assigned teams.
 */
export function useUnreviewedCheckins(eventId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['solve100-unreviewed', eventId, profile?.id],
    queryFn: () =>
      Solve100WeeklyCheckinService.getUnreviewedCheckins(eventId, profile?.id),
    enabled: isValidUUID(eventId) && !!profile?.id,
  });
}

/** Current week number derived from the event's start_date. */
export function useCurrentWeekNumber(eventId: string) {
  return useQuery({
    queryKey: ['solve100-current-week', eventId],
    queryFn: () =>
      Solve100WeeklyCheckinService.getCurrentWeekNumber(eventId),
    enabled: isValidUUID(eventId),
    staleTime: 5 * 60 * 1000, // 5 min — week changes slowly
  });
}
