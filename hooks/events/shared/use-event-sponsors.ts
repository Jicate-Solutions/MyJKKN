// hooks/events/shared/use-event-sponsors.ts
// React Query hooks for the shared (any-event-type) Sponsorship CRM — used by the shared
// <EventLogistics> Sponsors tab. Canonical home post-promotion (Events Platform Promotion PR1).
// The marathon-specific hooks remain for the legacy marathon sponsors route.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventSponsorService } from '@/lib/services/events/shared/event-sponsor-service';
import type {
  MarathonSponsor,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

const KEYS = {
  all: ['event-sponsors'] as const,
  list: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
};

/** All sponsors for an event, with deliverable counts. */
export function useEventSponsors(eventId: string) {
  return useQuery({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventSponsorService.getSponsors(eventId),
    enabled: !!eventId,
  });
}

/** Aggregated sponsor summary for an event. */
export function useEventSponsorSummary(eventId: string) {
  return useQuery({
    queryKey: KEYS.summary(eventId),
    queryFn: () => EventSponsorService.getSponsorSummary(eventId),
    enabled: !!eventId,
  });
}

/** Create a sponsor. */
export function useCreateEventSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateMarathonSponsorDto) => EventSponsorService.createSponsor(dto),
    onSuccess: (sponsor) => {
      qc.invalidateQueries({ queryKey: KEYS.list(sponsor.event_id) });
      qc.invalidateQueries({ queryKey: KEYS.summary(sponsor.event_id) });
      toast.success(`Sponsor "${sponsor.company_name}" added`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create sponsor'),
  });
}

/** Move a sponsor to a new pipeline stage. */
export function useMoveEventSponsorStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newStage }: { id: string; newStage: SponsorPipelineStage }) =>
      EventSponsorService.movePipelineStage(id, newStage),
    onSuccess: (sponsor: MarathonSponsor) => {
      qc.invalidateQueries({ queryKey: KEYS.list(sponsor.event_id) });
      toast.success(`Moved to "${sponsor.pipeline_stage}"`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to move stage'),
  });
}
