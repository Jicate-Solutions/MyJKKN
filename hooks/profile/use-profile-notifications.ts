// hooks/profile/use-profile-notifications.ts
// React Query hooks for reading profile-module notifications.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ProfileNotificationService,
  type ProfileNotificationRow,
} from '@/lib/services/profile/notification-service';

const ROOT_KEY = ['profile', 'notifications'] as const;

export function useProfileUnreadNotifications(limit = 20) {
  return useQuery<ProfileNotificationRow[]>({
    queryKey: [...ROOT_KEY, 'unread', limit],
    queryFn: () => ProfileNotificationService.getUnread(limit),
    staleTime: 30_000,
  });
}

export function useProfileAllNotifications(limit = 50) {
  return useQuery<ProfileNotificationRow[]>({
    queryKey: [...ROOT_KEY, 'all', limit],
    queryFn: () => ProfileNotificationService.getAll(limit),
    staleTime: 60_000,
  });
}

export function useMarkProfileNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userNotificationId: string) =>
      ProfileNotificationService.markAsRead(userNotificationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}

export function useMarkAllProfileNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => ProfileNotificationService.markAllAsRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ROOT_KEY });
    },
  });
}
