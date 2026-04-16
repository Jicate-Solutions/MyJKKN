// ============================================================================
// OKR Notifications Hook
// Hook for managing OKR-specific notifications
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export interface OKRNotification {
  id: string;
  notification_id: string;
  user_id: string;
  read_at: string | null;
  created_at: string;
  notification: {
    id: string;
    title: string;
    body: string;
    url: string | null;
    icon: string | null;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    category: string;
    metadata: {
      okr_notification_type?: string;
      week_number?: number;
      year?: number;
      objective_id?: string;
      key_result_id?: string;
      milestone_type?: string;
      old_badge?: string;
      new_badge?: string;
      [key: string]: any;
    } | null;
    sent_at: string;
  };
}

interface UseOKRNotificationsState {
  notifications: OKRNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

export function useOKRNotifications() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  const [state, setState] = useState<UseOKRNotificationsState>({
    notifications: [],
    unreadCount: 0,
    isLoading: true,
    error: null
  });

  // Fetch OKR notifications
  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const { data, error } = await (supabase as any)
        .from('user_notifications')
        .select(`
          id,
          notification_id,
          user_id,
          read_at,
          created_at,
          notification:notifications!inner(
            id,
            title,
            body,
            url,
            icon,
            priority,
            category,
            metadata,
            sent_at
          )
        `)
        .eq('user_id', profile.id)
        .eq('notification.category', 'okr')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const unreadCount = data?.filter((n: OKRNotification) => !n.read_at).length || 0;

      setState({
        notifications: data || [],
        unreadCount,
        isLoading: false,
        error: null
      });
    } catch (error: any) {
      console.error('[OKR Notifications] Error fetching:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch notifications'
      }));
    }
  }, [profile?.id, supabase]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await (supabase as any)
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n =>
          n.id === notificationId
            ? { ...n, read_at: new Date().toISOString() }
            : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1)
      }));
    } catch (error: any) {
      console.error('[OKR Notifications] Error marking as read:', error);
    }
  }, [supabase]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!profile?.id) return;

    try {
      // Get all unread notification IDs
      const unreadIds = state.notifications
        .filter(n => !n.read_at)
        .map(n => n.id);

      if (unreadIds.length === 0) return;

      const { error } = await (supabase as any)
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadIds);

      if (error) throw error;

      setState(prev => ({
        ...prev,
        notifications: prev.notifications.map(n => ({
          ...n,
          read_at: n.read_at || new Date().toISOString()
        })),
        unreadCount: 0
      }));
    } catch (error: any) {
      console.error('[OKR Notifications] Error marking all as read:', error);
    }
  }, [profile?.id, state.notifications, supabase]);

  // Setup real-time subscription
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`okr_notifications_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${profile.id}`
        },
        async (payload: any) => {
          // Fetch the complete notification
          const { data: newNotification, error } = await (supabase as any)
            .from('user_notifications')
            .select(`
              id,
              notification_id,
              user_id,
              read_at,
              created_at,
              notification:notifications!inner(
                id,
                title,
                body,
                url,
                icon,
                priority,
                category,
                metadata,
                sent_at
              )
            `)
            .eq('id', payload.new.id)
            .single();

          if (error || !newNotification) return;

          // Only add if it's an OKR notification
          if (newNotification.notification?.category !== 'okr') return;

          setState(prev => ({
            ...prev,
            notifications: [newNotification, ...prev.notifications],
            unreadCount: prev.unreadCount + 1
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, supabase]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Get notification icon based on type
  const getNotificationIcon = useCallback((notification: OKRNotification) => {
    const type = notification.notification?.metadata?.okr_notification_type;
    switch (type) {
      case 'weekly_reminder':
        return 'clock';
      case 'deadline_warning':
        return 'alert-triangle';
      case 'overdue_alert':
        return 'x-circle';
      case 'manager_escalation':
        return 'alert-octagon';
      case 'milestone_celebration':
        return 'party-popper';
      case 'badge_change':
        return 'badge';
      case 'blocker_resolved':
        return 'check-circle';
      default:
        return 'target';
    }
  }, []);

  // Get notification color based on priority
  const getNotificationColor = useCallback((notification: OKRNotification) => {
    const priority = notification.notification?.priority;
    switch (priority) {
      case 'urgent':
        return 'text-red-600 bg-red-50';
      case 'high':
        return 'text-orange-600 bg-orange-50';
      case 'normal':
        return 'text-blue-600 bg-blue-50';
      case 'low':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-blue-600 bg-blue-50';
    }
  }, []);

  return {
    ...state,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    getNotificationIcon,
    getNotificationColor
  };
}

// Export types
export type { UseOKRNotificationsState };
