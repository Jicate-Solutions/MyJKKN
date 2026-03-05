// hooks/startup-studio/use-events.ts

import { useQuery } from '@tanstack/react-query';
import { EventService } from '@/lib/services/startup-studio/event-service';
import type { EventFilters } from '@/types/startup-studio';

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
