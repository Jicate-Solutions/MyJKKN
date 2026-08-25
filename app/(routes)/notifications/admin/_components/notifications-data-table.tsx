'use client';

import { useCallback, useState } from 'react';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Users, Trash2, MoreHorizontal, Pencil, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Notification } from '@/types/notifications';
import { usePermissions } from '@/hooks/use-permissions';
import { describeTargetAudience } from '@/lib/notifications/target-audience';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import toast from 'react-hot-toast';
import { EditNotificationDialog } from '@/app/(routes)/notifications/_components/edit-notification-dialog';
import type { NotificationWithStats } from '@/types/notification';
import { stripHtml } from '@/components/ui/rich-text-editor';

interface NotificationsDataTableProps {
  notifications: Notification[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function NotificationsDataTable({
  notifications,
  isLoading,
  error,
  onRefresh
}: NotificationsDataTableProps) {
  const router = useRouter();
  const { canAccess } = usePermissions();

  const canDeleteNotifications = canAccess('notifications', 'delete');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationWithStats | null>(null);

  const handleEditMessage = useCallback((notification: Notification) => {
    // Map Notification to NotificationWithStats shape for the dialog
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

  const handleReuseMessage = useCallback(
    (notification: Notification) => {
      const params = new URLSearchParams({
        reuse: 'true',
        title: notification.title,
        body: notification.body,
        priority: notification.priority,
        category: notification.category
      });
      router.push(`/notifications/admin/new?${params.toString()}`);
    },
    [router]
  );

  const handleEditSuccess = useCallback(() => {
    onRefresh();
  }, [onRefresh]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'destructive';
      case 'high':
        return 'secondary';
      case 'normal':
        return 'default';
      case 'low':
        return 'outline';
      default:
        return 'default';
    }
  };

  // The audience label comes from the one shared rule (PR #3128), not a local
  // copy. The copy that used to live here recognised only `target_roles` and
  // the structural keys, so every person-targeted send — 99.9% of the table —
  // fell through to the literal 'All Users'.
  //
  // Legacy top-level `target_*` columns are still honoured: they predate the
  // `targeting` JSONB and a handful of old rows carry nothing else.
  const getTargetDescription = (notification: Notification) => {
    const targeting = notification.targeting || {};
    return describeTargetAudience({
      ...targeting,
      institution_id:
        targeting.institution_id || notification.target_institution_id || null,
      department_id:
        targeting.department_id || notification.target_department_id || null,
      program_id: targeting.program_id || notification.target_program_id || null,
      semester_id:
        targeting.semester_id ||
        (notification.target_semester ? String(notification.target_semester) : null),
      section_id: targeting.section_id || notification.target_section || null
    });
  };

  const columns: PermissionColumnDef<Notification, any>[] = [
    {
      id: 'title',
      header: 'Title',
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <div className='min-w-0'>
            <Link
              href={`/notifications/admin/${notification.id}`}
              className='hover:text-primary'
            >
              <div className='font-medium text-sm line-clamp-1'>{notification.title}</div>
              <div className='text-xs text-muted-foreground line-clamp-1 sm:line-clamp-2'>
                {stripHtml(notification.body)}
              </div>
              {/* Show priority + time inline on mobile */}
              <div className='flex items-center gap-2 mt-1 sm:hidden'>
                <Badge variant={getPriorityColor(notification.priority) as any} className='text-[10px] px-1.5 py-0'>
                  {notification.priority}
                </Badge>
                <span className='text-[10px] text-muted-foreground'>
                  {formatDistanceToNow(new Date(notification.sent_at), { addSuffix: true })}
                </span>
              </div>
            </Link>
          </div>
        );
      }
    },
    {
      id: 'target',
      header: 'Target',
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <div className='flex items-center gap-1 text-sm'>
            <Users className='h-3 w-3 flex-shrink-0' />
            <span className='line-clamp-1'>{getTargetDescription(notification)}</span>
          </div>
        );
      }
    },
    {
      id: 'priority',
      header: 'Priority',
      meta: { className: 'hidden sm:table-cell' },
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <Badge variant={getPriorityColor(notification.priority) as any}>
            {notification.priority}
          </Badge>
        );
      }
    },
    {
      id: 'category',
      header: 'Category',
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => {
        const notification = row.original;
        return <Badge variant='outline'>{notification.category}</Badge>;
      }
    },
    {
      id: 'sent_at',
      header: 'Sent',
      meta: { className: 'hidden sm:table-cell' },
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <div className='text-sm text-muted-foreground'>
            {formatDistanceToNow(new Date(notification.sent_at), {
              addSuffix: true
            })}
          </div>
        );
      }
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='sm' title='Actions'>
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-[160px]'>
              <DropdownMenuItem asChild>
                <Link
                  href={`/notifications/admin/${notification.id}`}
                  className='flex items-center w-full'
                >
                  <Eye className='mr-2 h-4 w-4' />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => handleEditMessage(notification)}
              >
                <Pencil className='mr-2 h-4 w-4' />
                Edit Message
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleReuseMessage(notification)}
              >
                <Copy className='mr-2 h-4 w-4' />
                Reuse Message
              </DropdownMenuItem>
              {canDeleteNotifications && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDeleteNotification(notification.id)}
                    className='text-red-600 focus:text-red-600 focus:bg-red-50'
                  >
                    <Trash2 className='mr-2 h-4 w-4' />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableSorting: false
    }
  ];

  const handleDeleteNotification = useCallback(
    async (notificationId: string) => {
      try {
        const response = await fetch(
          `/api/admin/notifications/${notificationId}`,
          {
            method: 'DELETE'
          }
        );

        if (!response.ok) {
          throw new Error('Failed to delete notification');
        }

        // Remove the deleted notification from local state
        // setNotifications((prev) => prev.filter((n) => n.id !== notificationId)); // This line is removed
        toast.success('Notification deleted successfully');
        onRefresh(); // Refresh parent state
      } catch (error) {
        console.error('Error deleting notification:', error);
        toast.error('Failed to delete notification');
      }
    },
    [onRefresh]
  );

  const handleBulkDelete = useCallback(
    async (selectedNotifications: Notification[]) => {
      try {
        const deletePromises = selectedNotifications.map((notification) =>
          fetch(`/api/admin/notifications/${notification.id}`, {
            method: 'DELETE'
          })
        );

        const responses = await Promise.all(deletePromises);
        const failedDeletes = responses.filter((response) => !response.ok);

        if (failedDeletes.length > 0) {
          throw new Error(
            `Failed to delete ${failedDeletes.length} notifications`
          );
        }

        // Remove deleted notifications from local state
        // const deletedIds = selectedNotifications.map((n) => n.id); // This line is removed
        toast.success(
          `Successfully deleted ${selectedNotifications.length} notification${
            selectedNotifications.length > 1 ? 's' : ''
          }`
        );
        onRefresh(); // Refresh parent state
      } catch (error) {
        console.error('Error deleting notifications:', error);
        toast.error('Failed to delete some notifications');
      }
    },
    [onRefresh]
  );

  if (isLoading) {
    return (
      <div className='flex justify-center items-center py-8'>
        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary'></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-muted-foreground'>Error: {error}</p>
        <Button onClick={onRefresh} variant='outline' className='mt-4'>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <>
      <DataTable
        columns={columns}
        data={notifications}
        searchPlaceholder='Search notifications...'
        permissions={{
          module: 'notifications',
          actions: {
            view: true,
            delete: canDeleteNotifications
          },
          showPermissionError: true
        }}
        onRefresh={onRefresh}
        onBulkAction={canDeleteNotifications ? handleBulkDelete : undefined}
        bulkActionConfig={{
          label: 'Delete Selected',
          icon: Trash2,
          variant: 'destructive',
          confirmTitle: 'Delete Notifications',
          confirmDescription:
            'Are you sure you want to delete {count} notification{plural}? This action cannot be undone.',
          successMessage: 'Successfully deleted {count} notification{plural}',
          errorMessage: 'Failed to delete selected notifications',
          loadingText: 'Deleting notifications...'
        }}
        getRowId={(row) => row.id}
      />

      {/* Edit Notification Dialog */}
      <EditNotificationDialog
        notification={editingNotification}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}
