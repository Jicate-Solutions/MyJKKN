'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { UserNotification } from '@/types/notifications';

const PAGE_SIZE = 20;

/**
 * Server-computed, GLOBAL rollup for one `metadata.event` value.
 *
 * `distinct_entities` is the only trustworthy figure a collapsed stack can
 * print: the Instagram-silence stack is 35 departments × 4 alert days = 140
 * rows, of which a page-1 client holds 20. Neither 140 nor 20 is a department
 * count. Optional on the wire — a deployment that predates the API change omits
 * `event_rollups`, and the UI must then print NO number rather than invent one.
 */
export interface NotificationEventRollup {
  event: string;
  /** Total rows carrying this event, globally. */
  rows: number;
  /** Distinct entities the event is about (e.g. distinct ig_user_id). */
  distinct_entities: number;
  /** metadata field holding the entity id, e.g. 'ig_user_id'. */
  entity_key: string;
}

interface NotificationsState {
  notifications: UserNotification[];
  /** GLOBAL unread across the whole inbox — never the loaded page's length. */
  unreadCount: number;
  /** GLOBAL total across the whole inbox. */
  totalCount: number;
  /** GLOBAL tally per RAW stored category value, e.g. { Alert: 143, general: 20 }. */
  categoryCounts: Record<string, number>;
  eventRollups: NotificationEventRollup[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
}

/** Sort key: the flat shape the service returns has no `sent_at`, the raw row
 *  the realtime subscription inserts does. Read every shape. */
function timestampOf(item: any): number {
  const notif = item?.notification || item || {};
  const raw = notif.sent_at || notif.created_at || item?.created_at;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

function dedupeById(items: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of items) {
    const key = item?.id || item?.notification_id;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(item);
  }
  return out;
}

function sortNewestFirst(items: any[]): any[] {
  return [...items].sort((a, b) => timestampOf(b) - timestampOf(a));
}

function sameSelection(a: string[] | null, b: string[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function useNotifications() {
  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    totalCount: 0,
    categoryCounts: {},
    eventRollups: [],
    isLoading: false,
    error: null,
    hasMore: false
  });

  // Memoize the supabase client to prevent re-creation on every render
  const supabase = useMemo(() => createClientSupabaseClient(), []);

  /** Raw category values currently requested from the server; null = no filter. */
  const categoriesRef = useRef<string[] | null>(null);
  /** Explicit page cursor. Derived-from-length paging (`length / 20 + 1`) breaks
   *  the moment one page can carry more than PAGE_SIZE rows, which a fan-out
   *  request does. */
  const pageRef = useRef(1);

  const fetchPage = useCallback(
    async (category: string | null, page: number, unreadOnly: boolean) => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: PAGE_SIZE.toString(),
        ...(unreadOnly && { unread_only: 'true' })
      });
      if (category) params.set('category', category);

      const response = await fetch(`/api/notifications?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      return response.json();
    },
    []
  );

  // Fetch notifications from API
  const fetchNotifications = useCallback(
    async (
      page = 1,
      unreadOnly = false,
      categories: string[] | null | undefined = undefined
    ) => {
      const selection =
        categories === undefined ? categoriesRef.current : categories;
      categoriesRef.current = selection;
      pageRef.current = page;

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        // A namespace tab (Briefings = every `dashboard:*` value) has no single
        // ?category to send: the API matches one category exactly, only
        // case-insensitively (ilike, no wildcards). Fan out one request per
        // member category and merge — the alternative, filtering a 20-row page
        // client-side, is what stranded 133 dashboard:* rows (43% of the inbox)
        // behind a tab that could never reach them.
        const targets = selection && selection.length ? selection : [null];
        const results = await Promise.all(
          targets.map((category) => fetchPage(category, page, unreadOnly))
        );

        const incoming = results.flatMap((r) => r?.notifications || []);
        // Counts are GLOBAL — the API derives them from COUNT queries over the
        // whole inbox and does NOT apply the ?category filter — so every
        // response in the fan-out carries the same figures.
        const head: any = results[0] || {};

        setState((prev) => ({
          ...prev,
          notifications: sortNewestFirst(
            dedupeById(
              page === 1
                ? incoming
                : [...(prev.notifications || []), ...incoming]
            )
          ),
          unreadCount: head.unread_count || 0,
          totalCount: head.total_count || 0,
          categoryCounts: head.category_counts || {},
          eventRollups: Array.isArray(head.event_rollups)
            ? head.event_rollups
            : [],
          // Any sub-stream with another page means the merged view has more.
          hasMore: results.some((r) => r?.has_more),
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
    [fetchPage]
  );

  /**
   * Choose which raw category values the server should return.
   * Pass null for "no filter". Re-fetches from page 1 when the selection
   * actually changes; a no-op otherwise, so callers can drive this from an
   * effect without thrashing the network.
   */
  const setCategoryFilter = useCallback(
    (categories: string[] | null) => {
      const next = categories && categories.length ? categories : null;
      if (sameSelection(categoriesRef.current, next)) return;
      fetchNotifications(1, false, next);
    },
    [fetchNotifications]
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
        notifications: (prev.notifications || []).map((notification) =>
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
    fetchNotifications(pageRef.current + 1, false, categoriesRef.current);
  }, [state.hasMore, state.isLoading, fetchNotifications]);

  // Set up real-time subscription
  useEffect(() => {
    let subscription: any = null;

    const setupRealtimeSubscription = async () => {
      try {
        // Get current user from local session cache (avoids HTTP round-trip)
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const user = session?.user;

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
                        metadata,
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
                      ...(prev.notifications || [])
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
    setCategoryFilter,
    markAsRead: markSingleAsRead,
    markAllAsRead,
    loadMore,
    refresh: () => fetchNotifications(1, false, categoriesRef.current)
  };
}
