// hooks/faculty-innovation/use-notifications.ts
// Bell icon data: unread count + notification list + mark-read.

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { FacultyInnovationNotificationService } from '@/lib/services/faculty-innovation/notification-service';
import { useAuth } from '@/hooks/use-auth';
import type { FacultyInnovationNotification } from '@/types/faculty-innovation';

const NOTIFICATION_DATA = {
  staleTime: 15 * 1000,           // 15s — check frequently for new items
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
} satisfies Partial<UseQueryOptions<any, any, any, any>>;

export const notificationKeys = {
  all: ['faculty-innovation-notifications'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
};

/**
 * Unread count for bell icon badge.
 */
export function useInnovationNotificationCount() {
  const { profile } = useAuth();

  const query = useQuery<number>({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => FacultyInnovationNotificationService.getUnreadCount(),
    enabled: !!profile?.id,
    ...NOTIFICATION_DATA,
  });

  return {
    count: query.data ?? 0,
    isLoading: query.isLoading,
  };
}

/**
 * Unread notifications for dropdown panel.
 */
export function useInnovationNotifications() {
  const { profile } = useAuth();

  const query = useQuery<FacultyInnovationNotification[]>({
    queryKey: notificationKeys.unread(),
    queryFn: () => FacultyInnovationNotificationService.getUnread(20),
    enabled: !!profile?.id,
    ...NOTIFICATION_DATA,
  });

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * All notifications (read + unread).
 */
export function useAllInnovationNotifications() {
  const { profile } = useAuth();

  const query = useQuery<FacultyInnovationNotification[]>({
    queryKey: notificationKeys.list(),
    queryFn: () => FacultyInnovationNotificationService.getAll(50),
    enabled: !!profile?.id,
    ...NOTIFICATION_DATA,
  });

  return {
    notifications: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/**
 * Mutation hooks for marking notifications as read.
 */
export function useNotificationActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  const markRead = useMutation({
    mutationFn: (id: string) =>
      FacultyInnovationNotificationService.markRead(id),
    onSuccess: () => invalidate(),
  });

  const markAllRead = useMutation({
    mutationFn: () =>
      FacultyInnovationNotificationService.markAllRead(),
    onSuccess: () => invalidate(),
  });

  return { markRead, markAllRead };
}
