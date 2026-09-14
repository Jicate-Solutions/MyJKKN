// hooks/events/shared/use-event-tasks.ts
// React Query hooks for the event detail console's "Pending Tasks" card.
//
// Separate query key from use-event-committees' ['event-committees', …]: the
// committees board fetches committees WITH their tasks nested, this card fetches
// tasks across the whole event. A shared key would make each one's invalidation
// refetch the other's heavier query on every checkbox tick.
//
// The two views do overlap — a committee task edited on the Committees board is
// a row this card also shows — so both keys are invalidated after a write here.
// One-directional on purpose: this card only ever writes event-level rows, which
// the committees board does not display, so it does not need the reverse.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  EventTaskService,
  type CreateEventTaskDto,
  type EventTaskRow,
  type UpdateEventTaskDto,
} from '@/lib/services/events/shared/event-task-service';

const KEYS = {
  all: ['event-tasks'] as const,
  list: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
};

/**
 * @param enabled pass the viewer's READ grant. When a student opens the page the
 *   card is not rendered at all, so this normally stays true; it exists so a
 *   caller can hold the fetch back rather than firing a query it will discard.
 */
export function useEventTasks(eventId: string, enabled = true) {
  return useQuery<EventTaskRow[]>({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventTaskService.listTasks(eventId),
    enabled: !!eventId && enabled,
  });
}

function useInvalidate(eventId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
    // The Committees board renders the same table from its own key.
    qc.invalidateQueries({ queryKey: ['event-committees', 'list', eventId] });
  };
}

export function useCreateEventTask(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (dto: CreateEventTaskDto) => EventTaskService.createTask(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Task added');
    },
    // The service has already translated an RLS refusal into the actual rule
    // ("Only a super admin or this event's in-charge…"), so show it as-is.
    onError: (e: Error) => toast.error(e.message || 'Failed to add task'),
  });
}

export function useUpdateEventTask(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEventTaskDto }) =>
      EventTaskService.updateTask(id, dto),
    // Silent on success: the common case is ticking a checkbox, and a toast per
    // tick would bury the screen while someone works down the list.
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to update task'),
  });
}

export function useDeleteEventTask(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (id: string) => EventTaskService.deleteTask(id),
    onSuccess: () => {
      invalidate();
      toast.success('Task removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove task'),
  });
}
