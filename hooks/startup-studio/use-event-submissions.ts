import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventSubmissionService } from '@/lib/services/startup-studio/event-submission-service';
import { useAuth } from '@/hooks/use-auth';
import type { SubmitProjectDto, UpdateMetricsDto, EventConfig } from '@/types/startup-studio';

export function useMySubmission(eventId: string | undefined) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-submission', eventId, profile?.id],
    queryFn: () => {
      if (!eventId || !profile?.id) return null;
      return EventSubmissionService.getMySubmission(eventId, profile.id);
    },
    enabled: !!eventId && !!profile?.id,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useSubmitProject() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: SubmitProjectDto) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventSubmissionService.createSubmission(dto, profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submission'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Project submitted!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to submit project');
    },
  });
}

export function useUpdateSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<SubmitProjectDto> }) => {
      return EventSubmissionService.updateSubmission(id, dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submission'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Submission updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update submission');
    },
  });
}

export function useUpdateMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto, config }: { id: string; dto: UpdateMetricsDto; config: EventConfig }) => {
      return EventSubmissionService.updateMetrics(id, dto, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submission'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Metrics updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update metrics');
    },
  });
}
