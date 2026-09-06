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
import type {
  Event,
  EventDeleteBlockers,
  EventStatus,
  UpdateEventDto,
} from '@/types/events';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['general-events'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  detail: (id: string) => [...KEYS.all, 'detail', id] as const,
  deleteBlockers: (id: string) => [...KEYS.all, 'delete-blockers', id] as const,
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
      // The induction list renders `events` rows too — its own query key would
      // otherwise keep showing the pre-edit name and dates until a reload.
      queryClient.invalidateQueries({ queryKey: ['inductions'] });
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

/**
 * What deleting this event would cascade away.
 *
 * `enabled` is the point of this hook: the Events Hub renders ten rows a page,
 * and pre-fetching blockers for all of them would be ten RPCs to answer a
 * question nobody asked. Pass `enabled` only once the confirm dialog is open, so
 * exactly one call runs per delete attempt.
 *
 * Not retried — the RPC self-authorizes and throws 42501 for a caller without
 * events.delete, which is a verdict, not a transient failure.
 */
export function useEventDeleteBlockers(id: string | null, enabled: boolean) {
  return useQuery<EventDeleteBlockers>({
    queryKey: KEYS.deleteBlockers(id ?? ''),
    queryFn: () => EventBaseService.getEventDeleteBlockers(id as string),
    enabled: !!id && enabled,
    retry: false,
    staleTime: 0,
  });
}

/**
 * Delete an event from the hub — gated by `events.delete` in the UI, by the
 * events_auth_delete RLS policy in the database, and refused outright by
 * trg_events_block_delete_with_dependents when registrations or payments hang
 * off the row.
 *
 * Invalidates the tournament and marathon lists as well as its own. The hub
 * table lists EVERY event type, so a delete here can remove a row that
 * /events/tournaments is also showing; invalidating only ['general-events']
 * would leave that page displaying an event that no longer exists.
 *
 * Invalidates KEYS.all, not KEYS.lists(). The hub table runs in fetchDataFn
 * mode — it never registers a ['general-events','list'] query — so it refreshes
 * through useDataTableRefreshOnInvalidate, which listens for an invalidate event
 * on a CACHED query under the ['general-events'] prefix. Narrowing to lists()
 * would match nothing in the cache on that page, fire no event, and leave the
 * deleted row on screen. The blockers query for this id is always cached by the
 * time we get here, and KEYS.all covers it.
 */
export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => EventBaseService.deleteEvent(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      queryClient.removeQueries({ queryKey: KEYS.detail(id) });
      queryClient.removeQueries({ queryKey: KEYS.deleteBlockers(id) });
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['marathon-events'] });
      queryClient.invalidateQueries({ queryKey: ['inductions'] });
      toast.success('Event deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete event');
    },
  });
}
