// hooks/events/use-general-events.ts
// React Query hooks for GENERAL (non-tournament / non-marathon / non-induction)
// events — the wizard-created rows that have no dedicated console. Mirrors
// hooks/events/use-tournaments.ts; list + update only (create stays with the
// /events/create wizard). Created: 2026-07-26 (NAAC tagging for generic events,
// extends PR #2413's writer).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import type { Event, UpdateEventDto } from '@/types/events';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['general-events'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
};

/**
 * Event types with a dedicated management console — excluded here so the
 * general list only surfaces rows that are otherwise unmanageable.
 * EventFilters has no NOT-IN support, so we fetch all RLS-visible rows and
 * filter client-side (prod holds ~30 events total — trivially small).
 * NOTE: compared as raw strings because live event_type values (lecture,
 * cultural, convocation, …) are wider than the TS EventType union.
 */
const EXCLUDED_EVENT_TYPES = new Set(['sports_tournament', 'marathon', 'induction']);

// ============================================================================
// Query Hooks
// ============================================================================

/** Fetch all general events (RLS gates per-row visibility). */
export function useGeneralEvents() {
  return useQuery({
    queryKey: KEYS.lists(),
    queryFn: async () => {
      const events = await EventBaseService.getEvents({});
      return events.filter(
        (e: Event) => !EXCLUDED_EVENT_TYPES.has(e.event_type as string)
      );
    },
  });
}

/**
 * One event by id, for the general-event detail page. Deliberately NOT
 * filtered by event_type — the page itself redirects tournaments to their
 * own console, so a type filter here would only turn that redirect into a
 * "not found".
 */
export function useGeneralEvent(id: string) {
  return useQuery({
    queryKey: [...KEYS.all, 'detail', id] as const,
    queryFn: () => EventBaseService.getEvent(id),
    enabled: !!id,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/** Update a general event (same EventBaseService.updateEvent path as #2413). */
export function useUpdateGeneralEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEventDto }) =>
      EventBaseService.updateEvent(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Event updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update event');
    },
  });
}
