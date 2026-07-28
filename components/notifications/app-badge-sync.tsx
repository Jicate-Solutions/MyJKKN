'use client';

import { useAuth } from '@/hooks/use-auth';
import { useUnreadNotifications } from '@/hooks/notification/use-notifications';
import { useAppBadge } from '@/hooks/notification/use-app-badge';

/**
 * Headless: keeps the installed-app icon badge (Badging API) in sync with the
 * viewer's GLOBAL unread notification count. Renders nothing.
 *
 * Mounted once, app-wide, in the root layout so the badge tracks the count on
 * every authenticated page — not only where the notification bell happens to
 * render. It reuses the bell's `useUnreadNotifications` query (same React Query
 * key `['notifications','unread',userId]`), so there is NO extra network fetch:
 * both consumers share one cache entry that already polls every 30s and
 * invalidates on realtime notification events.
 */
export function AppBadgeSync(): null {
  const { profile } = useAuth();
  const { data } = useUnreadNotifications(profile?.id);
  useAppBadge(data?.unreadCount);
  return null;
}
