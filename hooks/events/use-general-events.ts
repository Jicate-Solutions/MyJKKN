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
import { GeneralEventService } from '@/lib/services/events/core/general-event-service';
import { isGeneralEventActive } from '@/types/events';
import type { Event, EventStatus, UpdateEventDto } from '@/types/events';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['general-events'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
};

/**
 * Event types with a dedicated management console, mapped to it. Two callers:
 * the general list excludes these rows (they are managed elsewhere), and
 * /events/[id] redirects anyone who lands there with a specialised event's id
 * rather than rendering a console that can't manage it.
 * NOTE: keyed by raw string because live event_type values (lecture, cultural,
 * convocation, …) are wider than the TS EventType union.
 */
export const DEDICATED_EVENT_CONSOLES: Record<string, (id: string) => string> = {
  sports_tournament: (id) => `/events/tournament/${id}`,
  marathon: (id) => `/events/marathon/${id}/dashboard`,
  induction: (id) => `/events/induction/${id}`,
};

/**
 * EventFilters has no NOT-IN support, so we fetch all RLS-visible rows and
 * filter client-side (prod holds ~30 events total — trivially small).
 */
const EXCLUDED_EVENT_TYPES = new Set(Object.keys(DEDICATED_EVENT_CONSOLES));

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
 * Fetch one event by id for the general detail console. Not filtered by type —
 * the page itself redirects specialised types to their own console, which it
 * cannot do without first reading the row.
 */
export function useGeneralEvent(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
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
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success('Event updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update event');
    },
  });
}

/**
 * Flip a general event between Draft and Active.
 * Goes through GeneralEventService so the transition is validated in one place
 * — a UI-only status change is the exact shape of bug this repo keeps hitting.
 */
export function useUpdateGeneralEventStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) =>
      GeneralEventService.updateStatus(id, status),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success(
        isGeneralEventActive(event.status)
          ? 'Event is now Active'
          : 'Event moved to Draft'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });
}
