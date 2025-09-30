// hooks/notification/use-notifications.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  getNotification,
  createNotification,
  updateNotification,
  deleteNotification,
  bulkUpdateNotifications,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  deleteAllRead,
  getNotificationStats,
  getUserPreferences,
  createPreference,
  updatePreference,
  deletePreference,
  sendNotification
} from '@/lib/services/notification/notification-service';
import type {
  NotificationFilters,
  CreateNotificationDto,
  UpdateNotificationDto,
  BulkUpdateNotificationDto,
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
  SendNotificationDto
} from '@/types/notification';
import { useToast } from '@/hooks/use-toast';

// ==================== QUERY HOOKS ====================

export function useNotifications(filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: () => getNotifications(filters),
    staleTime: 10 * 1000 // 10 seconds for real-time feel
  });
}

export function useNotification(id: string | undefined) {
  return useQuery({
    queryKey: ['notifications', id],
    queryFn: () => (id ? getNotification(id) : null),
    enabled: !!id,
    staleTime: 30 * 1000
  });
}

export function useUnreadNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', 'unread', userId],
    queryFn: () =>
      userId
        ? getNotifications({
            user_id: userId,
            is_read: false,
            is_archived: false
          })
        : [],
    enabled: !!userId,
    staleTime: 5 * 1000, // 5 seconds for unread count
    refetchInterval: 30 * 1000 // Auto-refresh every 30 seconds
  });
}

export function useNotificationStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', 'stats', userId],
    queryFn: () => (userId ? getNotificationStats(userId) : null),
    enabled: !!userId,
    staleTime: 60 * 1000
  });
}

export function useNotificationPreferences(userId: string | undefined) {
  return useQuery({
    queryKey: ['notification-preferences', userId],
    queryFn: () => (userId ? getUserPreferences(userId) : []),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// ==================== MUTATION HOOKS ====================

export function useCreateNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CreateNotificationDto) => createNotification(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notification sent',
        description: 'The notification has been created successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create notification',
        variant: 'destructive'
      });
    }
  });
}

export function useUpdateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNotificationDto }) =>
      updateNotification(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notification deleted',
        description: 'The notification has been deleted successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete notification',
        variant: 'destructive'
      });
    }
  });
}

export function useBulkUpdateNotifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: BulkUpdateNotificationDto) =>
      bulkUpdateNotifications(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notifications updated',
        description: 'The selected notifications have been updated.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update notifications',
        variant: 'destructive'
      });
    }
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => markAllAsRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'All notifications marked as read',
        description: 'All your notifications have been marked as read.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark all as read',
        variant: 'destructive'
      });
    }
  });
}

export function useArchiveNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) => archiveNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });
}

export function useDeleteAllRead() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => deleteAllRead(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Read notifications deleted',
        description: 'All read notifications have been deleted.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete notifications',
        variant: 'destructive'
      });
    }
  });
}

export function useCreatePreference() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: CreateNotificationPreferenceDto) => createPreference(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Preference saved',
        description: 'Your notification preference has been saved.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save preference',
        variant: 'destructive'
      });
    }
  });
}

export function useUpdatePreference() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      data
    }: {
      id: string;
      data: UpdateNotificationPreferenceDto;
    }) => updatePreference(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Preference updated',
        description: 'Your notification preference has been updated.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update preference',
        variant: 'destructive'
      });
    }
  });
}

export function useDeletePreference() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => deletePreference(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast({
        title: 'Preference deleted',
        description: 'Your notification preference has been deleted.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete preference',
        variant: 'destructive'
      });
    }
  });
}

export function useSendNotification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (dto: SendNotificationDto) => sendNotification(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Notifications sent',
        description: `${data.length} notification(s) have been sent successfully.`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send notifications',
        variant: 'destructive'
      });
    }
  });
}
