// hooks/events/shared/use-event-kit.ts
// React Query hooks for shared event kit / t-shirt / merch distribution (Events Platform Promotion PR8).
// Reads + toggles the tshirt_collected* columns on events_registrations via EventKitService.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventKitService } from '@/lib/services/events/shared/event-kit-service';

const KEYS = {
  all: ['event-kit'] as const,
  recipients: (eventId: string) => [...KEYS.all, 'recipients', eventId] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
};

export function useEventKitRecipients(eventId: string) {
  return useQuery({
    queryKey: KEYS.recipients(eventId),
    queryFn: () => EventKitService.getRecipients(eventId),
    enabled: !!eventId,
  });
}

export function useEventKitSummary(eventId: string) {
  return useQuery({
    queryKey: KEYS.summary(eventId),
    queryFn: () => EventKitService.getSummary(eventId),
    enabled: !!eventId,
  });
}

export function useSetKitCollected(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      collected,
      operatorId,
    }: {
      registrationId: string;
      collected: boolean;
      operatorId: string | null;
    }) => EventKitService.setCollected(registrationId, collected, operatorId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: KEYS.recipients(eventId) });
      qc.invalidateQueries({ queryKey: KEYS.summary(eventId) });
      toast.success(variables.collected ? 'Marked collected' : 'Marked not collected');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update kit status'),
  });
}
