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
  notes: (eventId: string) => [...KEYS.all, 'notes', eventId] as const,
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

/**
 * Delete a sponsor.
 *
 * The row does not go alone: event_sponsor_deliverables and
 * event_sponsor_activity_log both reference it ON DELETE CASCADE, so every
 * promised deliverable and the whole contact history go with it. The card's
 * confirmation says so — this hook only carries out a decision already taken.
 *
 * eventId is passed in rather than read off the deleted row, because the
 * service returns void and there is nothing left to read it from.
 */
export function useDeleteEventSponsor(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => EventSponsorService.deleteSponsor(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
      // The summary counts sponsors and sums pledges, so it is wrong the moment
      // one is removed.
      qc.invalidateQueries({ queryKey: KEYS.summary(eventId) });
      toast.success('Sponsor deleted');
    },
    // An RLS refusal arrives here as a plain Postgres error. Surfacing its
    // message beats "something went wrong" — it is how the budget-board denial
    // was diagnosed at all.
    onError: (error: Error) => toast.error(error.message || 'Failed to delete sponsor'),
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

/**
 * Edit a sponsor's details — company, contact, tier, amounts and notes
 * (BUG-006143: the shared board could only add or delete, never correct).
 */
export function useUpdateEventSponsor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MarathonSponsor> }) =>
      EventSponsorService.updateSponsor(id, dto),
    onSuccess: (sponsor: MarathonSponsor) => {
      qc.invalidateQueries({ queryKey: KEYS.list(sponsor.event_id) });
      // Pledged / received feed the summary tiles.
      qc.invalidateQueries({ queryKey: KEYS.summary(sponsor.event_id) });
      toast.success(`Sponsor "${sponsor.company_name}" updated`);
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update sponsor'),
  });
}

/** The event's free-text sponsorship note (BUG-006143). */
export function useEventSponsorshipNotes(eventId: string) {
  return useQuery({
    queryKey: KEYS.notes(eventId),
    queryFn: () => EventSponsorService.getSponsorshipNotes(eventId),
    enabled: !!eventId,
  });
}

export function useSaveEventSponsorshipNotes(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) => EventSponsorService.saveSponsorshipNotes(eventId, notes),
    onSuccess: (notes) => {
      qc.setQueryData(KEYS.notes(eventId), notes);
      toast.success('Sponsorship notes saved');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to save sponsorship notes'),
  });
}
