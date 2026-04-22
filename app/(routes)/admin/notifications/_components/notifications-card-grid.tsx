'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { Notification } from '@/types/notifications';
import type { NotificationWithStats } from '@/types/notification';
import { EditNotificationDialog } from '@/app/(routes)/notifications/_components/edit-notification-dialog';
import toast from 'react-hot-toast';
import { NotificationCard } from './notification-card';
import {
  NotificationStack,
  NotificationStackGroup
} from './notification-stack';

interface NotificationsCardGridProps {
  notifications: Notification[];
  activeCategory: string;
  onRefresh: () => void;
}

// Minimum size before collapsing near-duplicates into a single stack card.
// Groups of 1 or 2 render as individual cards so small runs stay visible.
const MIN_STACK_SIZE = 3;

/** Strip digit sequences to derive a stable grouping key */
function stripDigits(title: string): string {
  return title.replace(/\d+/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Replace digits with "#" for human-readable pattern display */
function prettifyPattern(title: string): string {
  return title.replace(/\d+/g, '#');
}

type GridItem =
  | { type: 'stack'; group: NotificationStackGroup; mostRecent: number }
  | { type: 'card'; notification: Notification; mostRecent: number };

/**
 * Group near-duplicate notifications into stacks.
 *
 * Group key: `${category_lc}|${title_with_digits_stripped}`
 * So "Lead stale for 332h" and "Lead stale for 367h" collapse into one stack
 * while "New enrollment: Ram" stays separate from "New enrollment: Priya"
 * because the names don't share a digit pattern.
 *
 * Groups of ≥3 become a NotificationStack; smaller groups render as raw cards.
 * Output is sorted by each item's most-recent sent_at descending.
 */
function buildGridItems(notifications: Notification[]): GridItem[] {
  const groupMap = new Map<string, Notification[]>();

  for (const n of notifications) {
    const key = `${(n.category || 'uncategorized').toLowerCase()}|${stripDigits(
      n.title
    )}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.push(n);
    } else {
      groupMap.set(key, [n]);
    }
  }

  const items: GridItem[] = [];

  for (const [key, group] of groupMap) {
    const sorted = [...group].sort(
      (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
    );
    const mostRecent = new Date(sorted[0].sent_at).getTime();

    if (sorted.length >= MIN_STACK_SIZE) {
      items.push({
        type: 'stack',
        mostRecent,
        group: {
          key,
          titlePattern: prettifyPattern(sorted[0].title),
          category: sorted[0].category,
          notifications: sorted
        }
      });
    } else {
      for (const n of sorted) {
        items.push({
          type: 'card',
          mostRecent: new Date(n.sent_at).getTime(),
          notification: n
        });
      }
    }
  }

  items.sort((a, b) => b.mostRecent - a.mostRecent);
  return items;
}

/**
 * Responsive card grid for notifications, with edit/reuse/delete row actions.
 *
 * Groups of ≥3 near-duplicate notifications (same category + same digit-stripped
 * title) collapse into a single expandable NotificationStack, keeping the feed
 * readable even when a cron fires 100+ items/day.
 */
export function NotificationsCardGrid({
  notifications,
  activeCategory,
  onRefresh
}: NotificationsCardGridProps) {
  const router = useRouter();
  const { canAccess } = usePermissions();

  const canDeleteNotifications = canAccess('notifications', 'delete');

  // Edit dialog state — shared across all cards (raw or stacked)
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationWithStats | null>(null);

  // Filter by active category (case-insensitive match;
  // tabs normalize keys to lowercase so 'Alerts' and 'alerts' share a tab).
  const filtered = useMemo(
    () =>
      activeCategory === 'all'
        ? notifications
        : notifications.filter(
            (n) =>
              (n.category || 'uncategorized').toLowerCase() === activeCategory
          ),
    [notifications, activeCategory]
  );

  const items = useMemo(() => buildGridItems(filtered), [filtered]);

  const handleEdit = useCallback((notification: Notification) => {
    setEditingNotification({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      category: notification.category,
      created_at: notification.created_at,
      updated_at: notification.updated_at,
      sent_to_count: 0,
      read_by_count: 0
    });
    setEditDialogOpen(true);
  }, []);

  const handleReuse = useCallback(
    (notification: Notification) => {
      const params = new URLSearchParams({
        reuse: 'true',
        title: notification.title,
        body: notification.body,
        priority: notification.priority,
        category: notification.category
      });
      router.push(`/admin/notifications/new?${params.toString()}`);
    },
    [router]
  );

  const handleDelete = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(
          `/api/admin/notifications/${notificationId}`,
          { method: 'DELETE' }
        );

        if (!response.ok) {
          throw new Error('Failed to delete notification');
        }

        toast.success('Notification deleted successfully');
        onRefresh();
      } catch (error) {
        console.error('Error deleting notification:', error);
        toast.error('Failed to delete notification');
      }
    },
    [onRefresh]
  );

  const handleEditSuccess = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  if (items.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-16 text-center'>
        <Bell className='h-12 w-12 text-muted-foreground/30 mb-4' />
        <p className='text-sm font-medium text-muted-foreground'>
          {activeCategory === 'all'
            ? 'No notifications yet'
            : `No ${activeCategory} notifications`}
        </p>
        <p className='text-xs text-muted-foreground mt-1'>
          Sent notifications will appear here
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Responsive card grid: 1 col mobile, 2 tablet, 3 desktop */}
      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
        {items.map((item) => {
          if (item.type === 'stack') {
            return (
              <NotificationStack
                key={item.group.key}
                group={item.group}
                canDelete={canDeleteNotifications}
                onEdit={handleEdit}
                onReuse={handleReuse}
                onDelete={handleDelete}
              />
            );
          }
          return (
            <NotificationCard
              key={item.notification.id}
              notification={item.notification}
              canDelete={canDeleteNotifications}
              onEdit={handleEdit}
              onReuse={handleReuse}
              onDelete={handleDelete}
            />
          );
        })}
      </div>

      <EditNotificationDialog
        notification={editingNotification}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}
