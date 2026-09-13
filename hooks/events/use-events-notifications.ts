// hooks/events/use-events-notifications.ts
// React Query hooks for reading events-module notifications.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EventsNotificationService,
  type EventsNotificationRow,
  type EventMessagePanel,
  type EventRegistrantMessage,
} from '@/lib/services/events/notification-service';

const ROOT_KEY = ['events', 'notifications'] as const;
const MESSAGES_KEY = ['events', 'registrant-messages'] as const;

// ─── Organiser messages ────────────────────────────────────────────────────
// The send side of this module. Everything below reads or writes through
// /api/events/[eventId]/messages, which authorises the session and then
// delivers through the canonical notification fanout.

/**
 * Recipient count + the log of what an organiser has already sent for one
 * event. Never cached across a send: the count is the blast radius, and a
 * stale one is worse than a spinner.
 *
 * `retry: false` because the two interesting failures — no access, migration
 * not applied — are not transient, and retrying them just delays the
 * explanation the board is meant to show.
 */
export function useEventMessagePanel(eventId: string, enabled = true) {
  return useQuery<EventMessagePanel>({
    queryKey: [...MESSAGES_KEY, eventId],
    queryFn: () => EventsNotificationService.getMessagePanel(eventId),
    enabled: Boolean(eventId) && enabled,
    staleTime: 0,
    retry: false,
  });
}

/**
 * Send one message to an event's registrants. The caller supplies the
 * idempotency token, so a double submit collapses onto the first send.
 */
export function useSendRegistrantMessage(eventId: string) {
  const qc = useQueryClient();
  return useMutation<
    { message: EventRegistrantMessage; deduplicated: boolean },
    Error,
    { subject: string; body: string; clientToken: string }
  >({
    mutationFn: (input) => EventsNotificationService.sendRegistrantMessage(eventId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...MESSAGES_KEY, eventId] });
      // A recipient of this blast may be the sender's own account.
      qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

/** Unread events notifications for the current user. Cached 30s. */
export function useEventsUnreadNotifications(limit = 20) {
  return useQuery<EventsNotificationRow[]>({
    queryKey: [...ROOT_KEY, 'unread', limit],
    queryFn: () => EventsNotificationService.getUnread(limit),
    staleTime: 30_000,
  });
}

/** All (read + unread) events notifications for the current user. Cached 60s. */
export function useEventsAllNotifications(limit = 50) {
  return useQuery<EventsNotificationRow[]>({
    queryKey: [...ROOT_KEY, 'all', limit],
    queryFn: () => EventsNotificationService.getAll(limit),
    staleTime: 60_000,
  });
}

/** Mark a single events notification as read. Invalidates unread + all queries. */
export function useMarkEventsNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userNotificationId: string) =>
      EventsNotificationService.markAsRead(userNotificationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

/** Mark all events notifications as read for the current user. */
export function useMarkAllEventsNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => EventsNotificationService.markAllAsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}
