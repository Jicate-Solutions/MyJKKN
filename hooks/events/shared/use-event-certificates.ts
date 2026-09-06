// hooks/events/shared/use-event-certificates.ts
// React Query hooks for shared event certificates (Events Platform Promotion PR6).
// Issue certificate IDs for finishers, list issued certificates, and read stats.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventCertificateService } from '@/lib/services/events/shared/event-certificate-service';

const KEYS = {
  all: ['event-certificates'] as const,
  stats: (eventId: string) => [...KEYS.all, 'stats', eventId] as const,
  list: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
};

export function useEventCertificateStats(eventId: string) {
  return useQuery({
    queryKey: KEYS.stats(eventId),
    queryFn: () => EventCertificateService.getCertificateStats(eventId),
    enabled: !!eventId,
  });
}

export function useEventCertificateList(eventId: string) {
  return useQuery({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventCertificateService.getCertificateList(eventId),
    enabled: !!eventId,
  });
}

export function useGenerateEventCertificates(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EventCertificateService.generateCertificates(eventId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.stats(eventId) });
      qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
      toast.success(
        res.generated > 0
          ? `${res.generated} certificate${res.generated !== 1 ? 's' : ''} issued`
          : 'No new certificates to issue'
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to issue certificates'),
  });
}
