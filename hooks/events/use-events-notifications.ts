// hooks/events/use-events-notifications.ts
// React Query hooks for reading events-module notifications.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EventsNotificationService,
  type EventsNotificationRow,
} from '@/lib/services/events/notification-service';

const ROOT_KEY = ['events', 'notifications'] as const;

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
