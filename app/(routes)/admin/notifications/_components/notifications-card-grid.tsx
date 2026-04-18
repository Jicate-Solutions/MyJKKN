'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { Notification } from '@/types/notifications';
import type { NotificationWithStats } from '@/types/notification';
import { EditNotificationDialog } from '@/app/(routes)/notifications/_components/edit-notification-dialog';
import toast from 'react-hot-toast';
import { NotificationCard } from './notification-card';

interface NotificationsCardGridProps {
  notifications: Notification[];
  activeCategory: string;
  onRefresh: () => void;
}

/**
 * Responsive card grid for notifications, with edit/reuse/delete row actions.
 *
 * Usage:
 * <NotificationsCardGrid
 *   notifications={notifications}
 *   activeCategory={activeCategory}
 *   onRefresh={handleRefresh}
 * />
 */
export function NotificationsCardGrid({
  notifications,
  activeCategory,
  onRefresh
}: NotificationsCardGridProps) {
  const router = useRouter();
  const { canAccess } = usePermissions();

  const canDeleteNotifications = canAccess('notifications', 'delete');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationWithStats | null>(null);

  // Filter notifications by active category
  const filtered =
    activeCategory === 'all'
      ? notifications
      : notifications.filter((n) => n.category === activeCategory);

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

  if (filtered.length === 0) {
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
        {filtered.map((notification) => (
          <NotificationCard
            key={notification.id}
            notification={notification}
            canDelete={canDeleteNotifications}
            onEdit={handleEdit}
            onReuse={handleReuse}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Edit dialog (shared across all cards) */}
      <EditNotificationDialog
        notification={editingNotification}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}
