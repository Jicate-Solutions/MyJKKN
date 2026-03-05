import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventLeaderboardService } from '@/lib/services/startup-studio/event-leaderboard-service';
import { useAuth } from '@/hooks/use-auth';

export function useLeaderboard(eventId: string) {
  return useQuery({
    queryKey: ['event-leaderboard', eventId],
    queryFn: () => EventLeaderboardService.getLeaderboard(eventId),
    enabled: !!eventId,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function usePublishResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, publish }: { eventId: string; publish: boolean }) =>
      publish
        ? EventLeaderboardService.publishResults(eventId)
        : EventLeaderboardService.unpublishResults(eventId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['startup-events'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event'] });
      queryClient.invalidateQueries({ queryKey: ['event-leaderboard'] });
      toast.success(variables.publish ? 'Results published!' : 'Results unpublished');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update results'),
  });
}

export function useMrrVerificationQueue(eventId: string) {
  return useQuery({
    queryKey: ['mrr-queue', eventId],
    queryFn: () => EventLeaderboardService.getMrrVerificationQueue(eventId),
    enabled: !!eventId,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useVerifyMrr() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (submissionId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventLeaderboardService.verifyMrr(submissionId, profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mrr-queue'] });
      queryClient.invalidateQueries({ queryKey: ['event-leaderboard'] });
      toast.success('MRR verified');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to verify MRR'),
  });
}

export function useRejectMrr() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ submissionId, reason }: { submissionId: string; reason: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventLeaderboardService.rejectMrr(submissionId, reason, profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mrr-queue'] });
      queryClient.invalidateQueries({ queryKey: ['event-leaderboard'] });
      toast.success('MRR rejected');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to reject MRR'),
  });
}

export function useDemoSlots(eventId: string) {
  return useQuery({
    queryKey: ['demo-slots', eventId],
    queryFn: () => EventLeaderboardService.getDemoSlots(eventId),
    enabled: !!eventId,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useGenerateDemoSlots() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      eventId: string;
      venueAssignmentId: string;
      startTime: string;
      durationMinutes: number;
      roomLabel: string;
      count: number;
    }) =>
      EventLeaderboardService.generateDemoSlots(
        params.eventId,
        params.venueAssignmentId,
        params.startTime,
        params.durationMinutes,
        params.roomLabel,
        params.count
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-slots'] });
      toast.success('Slots generated');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to generate slots'),
  });
}

export function useAssignTeamToSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, registrationId }: { slotId: string; registrationId: string }) =>
      EventLeaderboardService.assignTeamToSlot(slotId, registrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-slots'] });
      toast.success('Team assigned');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to assign team'),
  });
}

export function useUnassignSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => EventLeaderboardService.unassignSlot(slotId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demo-slots'] });
      toast.success('Slot unassigned');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to unassign slot'),
  });
}
