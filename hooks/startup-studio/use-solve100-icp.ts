// hooks/startup-studio/use-solve100-icp.ts
// React Query hooks for Solve for 100 ICP (Ideal Customer Profile) builder.
// Spec: docs/SPEC-solve-for-100.md
// Added: 2026-04-14

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Solve100ICPService } from '@/lib/services/startup-studio/solve100-icp-service';
import { useAuth } from '@/hooks/use-auth';
import type { CreateICPDto, UpdateICPDto } from '@/types/startup-studio';

// Guards against Next.js 15 DRP placeholders like "%%drp:id:abc%%" passed as route params.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean =>
  !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

/** Fetch the current team's ICP for this event. */
export function useMyICP(
  eventId: string,
  teamId: string | null | undefined
) {
  return useQuery({
    queryKey: ['solve100-icp', eventId, teamId],
    queryFn: () => Solve100ICPService.getMyICP(eventId, teamId!),
    enabled: isValidUUID(eventId) && isValidUUID(teamId),
  });
}

/** Create a new ICP for the team. */
export function useSubmitICP(eventId: string, teamId: string) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: CreateICPDto) =>
      Solve100ICPService.createICP(dto, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['solve100-icp', eventId, teamId],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-event-icps', eventId],
      });
      toast.success('Customer profile saved');
    },
    onError: (error: Error) => {
      toast.error('Failed to save customer profile', {
        description: error.message,
      });
    },
  });
}

/** Update an existing ICP — increments version. */
export function useUpdateICP(eventId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateICPDto }) =>
      Solve100ICPService.updateICP(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['solve100-icp', eventId, teamId],
      });
      queryClient.invalidateQueries({
        queryKey: ['solve100-event-icps', eventId],
      });
      toast.success('Customer profile updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update customer profile', {
        description: error.message,
      });
    },
  });
}

/** Admin: all ICPs for an event. */
export function useEventICPs(eventId: string) {
  return useQuery({
    queryKey: ['solve100-event-icps', eventId],
    queryFn: () => Solve100ICPService.getEventICPs(eventId),
    enabled: isValidUUID(eventId),
  });
}
