// hooks/events/shared/use-event-registrations.ts
// React Query hook for the shared Event Logistics "Registrations" tab.
// Read-only — there is no mutation counterpart by design (the tab does not
// create, edit or cancel registrations).

'use client';

import { useQuery } from '@tanstack/react-query';
import { EventRegistrationsService } from '@/lib/services/events/shared/event-registrations-service';

const KEYS = {
  all: ['event-registrations'] as const,
  list: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
};

export function useEventRegistrations(eventId: string, eventType: string) {
  return useQuery({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventRegistrationsService.getRegistrations(eventId, eventType),
    enabled: !!eventId,
  });
}
