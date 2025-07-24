'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { UserNotification } from '@/types/notifications';

interface NotificationsState {
  notifications: UserNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
}

export function useNotifications() {
  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    hasMore: false
  });

  const supabase = createClientSupabaseClient();

  // Fetch notifications from API
  const fetchNotifications = useCallback(
    async (page = 1, unreadOnly = false) => {
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
          ...(unreadOnly && { unread_only: 'true' })
        });

        const response = await fetch(`/api/notifications?${params}`);

        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();

        setState((prev) => ({
          ...prev,
          notifications:
            page === 1
              ? data.notifications
              : [...prev.notifications, ...data.notifications],
          unreadCount: data.unread_count,
          hasMore: data.has_more,
          isLoading: false,
          error: null
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to fetch notifications'
        }));
      }
    },
    []
  );

  // Mark notifications as read
  const markAsRead = useCallback(async (notificationIds?: string[]) => {
    try {
      const response = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notification_ids: notificationIds,
          mark_all: !notificationIds
        })
      });

      if (!response.ok) {
        throw new Error('Failed to mark notifications as read');
      }

      // Update local state
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((notification) =>
          !notificationIds ||
          notificationIds.includes(notification.notification_id)
            ? { ...notification, read_at: new Date().toISOString() }
            : notification
        ),
        unreadCount: notificationIds
          ? Math.max(0, prev.unreadCount - notificationIds.length)
          : 0
      }));
    } catch (error) {
      console.error('Error marking notifications as read:', error);
    }
  }, []);

  // Mark single notification as read
  const markSingleAsRead = useCallback(
    (notificationId: string) => {
      markAsRead([notificationId]);
    },
    [markAsRead]
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    markAsRead();
  }, [markAsRead]);

  // Load more notifications
  const loadMore = useCallback(() => {
    if (!state.hasMore || state.isLoading) return;

    const nextPage = Math.floor(state.notifications.length / 20) + 1;
    fetchNotifications(nextPage);
  }, [
    state.hasMore,
    state.isLoading,
    state.notifications.length,
    fetchNotifications
  ]);

  // Set up real-time subscription
  useEffect(() => {
    let subscription: any = null;

    const setupRealtimeSubscription = async () => {
      try {
        // Get current user
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) return;

        // Subscribe to new notifications for this user
        subscription = supabase
          .channel('user_notifications')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'user_notifications',
              filter: `user_id=eq.${user.id}`
            },
            (payload: any) => {
              console.log('New notification received:', payload);

              // Fetch the complete notification data
              const fetchNewNotification = async () => {
                try {
                  const { data: newNotification, error } = await supabase
                    .from('user_notifications')
                    .select(
                      `
                      id,
                      user_id,
                      read_at,
                      created_at,
                      notification_id,
                      notification:notifications (
                        id,
                        title,
                        body,
                        url,
                        icon,
                        priority,
                        category,
                        sent_at,
                        expires_at
                      )
                    `
                    )
                    .eq('id', payload.new.id)
                    .single();

                  if (error) {
                    console.error('Error fetching new notification:', error);
                    return;
                  }

                  // Add to the beginning of the notifications list
                  setState((prev) => ({
                    ...prev,
                    notifications: [
                      newNotification as unknown as UserNotification,
                      ...prev.notifications
                    ],
                    unreadCount: prev.unreadCount + 1
                  }));
                } catch (error) {
                  console.error('Error handling new notification:', error);
                }
              };

              fetchNewNotification();
            }
          )
          .subscribe();
      } catch (error) {
        console.error('Error setting up real-time subscription:', error);
      }
    };

    setupRealtimeSubscription();

    // Cleanup subscription on unmount
    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return {
    ...state,
    fetchNotifications,
    markAsRead: markSingleAsRead,
    markAllAsRead,
    loadMore,
    refresh: () => fetchNotifications(1)
  };
}
