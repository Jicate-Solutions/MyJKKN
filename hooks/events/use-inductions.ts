// hooks/events/use-inductions.ts
// React Query hook for the Fresher Induction list (/events/induction).
//
// The list page used to fetch with useState + a raw supabase call in the
// component, which meant a delete or an edit anywhere else left a stale table on
// screen until a reload. One query key, so the shared events mutations
// (useDeleteEvent / useUpdateGeneralEvent) can invalidate it.
//
// Writes deliberately DO NOT live here. An induction is an `events` row, and it
// is already deleted through EventBaseService.deleteEvent and edited through
// EventBaseService.updateEvent — the same paths the Events Hub uses, behind the
// same events_auth_delete / events_auth_update policies and the same cascade
// guard. A second writer for the same table is how allow-lists drift apart.

'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { InductionEventService } from '@/lib/services/events/core/induction-event-service';
import { getErrorMessage } from '@/lib/utils';
import { inductionStatusLabel, type EventStatus } from '@/types/events';
import { InductionService, type InductionListRow } from '@/lib/services/induction/induction-service';

export const INDUCTION_KEYS = {
  all: ['inductions'] as const,
  list: () => [...INDUCTION_KEYS.all, 'list'] as const,
};

/**
 * Every induction the caller can see, each with its appointed coordinators.
 *
 * Two calls, not N+1: the coordinators arrive as one RPC keyed by event and are
 * merged in here. `Promise.all` rather than sequential — the coordinator RPC
 * does not depend on which events came back, it self-authorizes per row.
 */
export function useInductions() {
  return useQuery<InductionListRow[]>({
    queryKey: INDUCTION_KEYS.list(),
    queryFn: async () => {
      const [rows, byEvent] = await Promise.all([
        InductionService.listInductions(),
        InductionService.coordinatorsByEvent(),
      ]);
      return rows.map((r) => ({ ...r, coordinators: byEvent.get(r.id) ?? [] }));
    },
  });
}

/**
 * Activate an induction, or put it back to Draft.
 *
 * Goes through InductionEventService so the transition is validated in one
 * place against INDUCTION_STATUS_TRANSITIONS. A UI-only status write that skips
 * the allow-list is the exact shape of bug this repo keeps hitting — see the
 * note on that map.
 *
 * Invalidates the general-events keys too: the same `events` row is listed on
 * the Events Hub, which would otherwise keep showing the old badge.
 */
export function useUpdateInductionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) =>
      InductionEventService.updateStatus(id, status),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: INDUCTION_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['general-events'] });
      toast.success(`Induction is now ${inductionStatusLabel(event.status)}`);
    },
    onError: (error: Error) => {
      toast.error(getErrorMessage(error) || 'Failed to update status');
    },
  });
}

/** What a bulk delete actually did, per row. */
export interface BulkDeleteOutcome {
  deleted: string[];
  refused: { name: string; reason: string }[];
}

/**
 * Delete several inductions, reporting what happened to EACH one.
 *
 * NOT a loop over useDeleteEvent(): that toasts "Event deleted" per call, and
 * more importantly it has no way to say "3 went, 2 were refused". Most
 * inductions hold enrolled learners and the database refuses those outright
 * (trg_events_block_delete_with_dependents), so partial failure is the NORMAL
 * outcome here, not the exception — a bulk action that reported a flat success
 * would be wrong most of the time it ran.
 *
 * Promise.allSettled, not Promise.all: one refusal must not abandon the rows
 * after it. Invalidates once at the end rather than per row, mirroring the keys
 * useDeleteEvent() touches — a delete here can remove a row the Events Hub, the
 * tournament list or the marathon list is also showing.
 */
export function useBulkDeleteInductions() {
  const queryClient = useQueryClient();

  return useCallback(
    async (rows: InductionListRow[]): Promise<BulkDeleteOutcome> => {
      const settled = await Promise.allSettled(
        rows.map((r) => EventBaseService.deleteEvent(r.id))
      );

      const outcome: BulkDeleteOutcome = { deleted: [], refused: [] };
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') outcome.deleted.push(rows[i].name);
        else outcome.refused.push({ name: rows[i].name, reason: getErrorMessage(result.reason) });
      });

      if (outcome.deleted.length > 0) {
        queryClient.invalidateQueries({ queryKey: INDUCTION_KEYS.all });
        queryClient.invalidateQueries({ queryKey: ['general-events'] });
        queryClient.invalidateQueries({ queryKey: ['tournaments'] });
        queryClient.invalidateQueries({ queryKey: ['marathon-events'] });
      }
      return outcome;
    },
    [queryClient]
  );
}
