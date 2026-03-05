// hooks/startup-studio/use-events.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EventService } from '@/lib/services/startup-studio/event-service';
import type { EventFilters, UpdateEventDto } from '@/types/startup-studio';
import { toast } from 'sonner';

export function useEvents(filters?: EventFilters) {
  return useQuery({
    queryKey: ['startup-events', filters],
    queryFn: () => EventService.getEvents(filters),
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['startup-event', id],
    queryFn: () => {
      if (!id) return null;
      return EventService.getEvent(id);
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    retry: 3,
  });
}

export function useEventStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ['startup-event-stats', eventId],
    queryFn: () => {
      if (!eventId) return null;
      return EventService.getEventStats(eventId);
    },
    enabled: !!eventId,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEventDto }) =>
      EventService.updateEvent(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['startup-events'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event', data.id] });
      toast.success('Event updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update event');
    },
  });
}
