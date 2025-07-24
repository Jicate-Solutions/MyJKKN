'use client';

import { useState, useEffect } from 'react';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Users, Trash2, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Notification } from '@/types/notifications';
import { usePermissions } from '@/hooks/use-permissions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface NotificationsDataTableProps {}

export function NotificationsDataTable({}: NotificationsDataTableProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canAccess } = usePermissions();

  const canDeleteNotifications = canAccess('notifications', 'delete');

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/notifications');

        if (!response.ok) {
          throw new Error('Failed to fetch notifications');
        }

        const data = await response.json();
        setNotifications(data.notifications || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, []);

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

  const getTargetDescription = (notification: Notification) => {
    if (!notification.targeting) return 'All Users';

    const parts = [];
    if (notification.targeting.institution_id) parts.push('Institution');
    if (notification.targeting.department_id) parts.push('Department');
    if (notification.targeting.program_id) parts.push('Program');
    if (notification.targeting.semester) parts.push('Semester');
    if (notification.targeting.section) parts.push('Section');

    return parts.length > 0 ? parts.join(' → ') : 'All Users';
  };

  const columns: PermissionColumnDef<Notification, any>[] = [
    {
      id: 'title',
      header: 'Title',
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <div>
            <div className='font-medium'>{notification.title}</div>
            <div className='text-sm text-muted-foreground line-clamp-2'>
              {notification.body}
            </div>
          </div>
        );
      }
    },
    {
      id: 'target',
      header: 'Target',
      cell: ({ row }) => {
        const notification = row.original;
        return (
          <div className='flex items-center gap-1 text-sm'>
            <Users className='h-3 w-3' />
            {getTargetDescription(notification)}
          </div>
        );
      }
    },
    {
      id: 'priority',
      header: 'Priority',
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
      cell: ({ row }) => {
        const notification = row.original;
        return <Badge variant='outline'>{notification.category}</Badge>;
      }
    },
    {
      id: 'sent_at',
      header: 'Sent',
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
          <div className='flex items-center gap-2'>
            <Link href={`/admin/notifications/${notification.id}`}>
              <Button
                variant='ghost'
                size='sm'
                title='View notification details'
              >
                <Eye className='h-4 w-4' />
              </Button>
            </Link>
            {canDeleteNotifications && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='ghost' size='sm' title='More actions'>
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onClick={() => handleDeleteNotification(notification.id)}
                    className='text-red-600 focus:text-red-600 focus:bg-red-50'
                  >
                    <Trash2 className='mr-2 h-4 w-4' />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      },
      enableSorting: false
    }
  ];

  const handleRefresh = async () => {
    const response = await fetch('/api/admin/notifications');
    if (response.ok) {
      const data = await response.json();
      setNotifications(data.notifications || []);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
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
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      toast.success('Notification deleted successfully');
    } catch (error) {
      console.error('Error deleting notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const handleBulkDelete = async (selectedNotifications: Notification[]) => {
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
      const deletedIds = selectedNotifications.map((n) => n.id);
      setNotifications((prev) =>
        prev.filter((n) => !deletedIds.includes(n.id))
      );

      toast.success(
        `Successfully deleted ${selectedNotifications.length} notification${
          selectedNotifications.length > 1 ? 's' : ''
        }`
      );
    } catch (error) {
      console.error('Error deleting notifications:', error);
      toast.error('Failed to delete some notifications');
    }
  };

  if (isLoading) {
    return <div>Loading notifications...</div>;
  }

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-muted-foreground'>Error: {error}</p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={notifications}
      searchPlaceholder='Search notifications...'
      filterColumn='title'
      permissions={{
        module: 'notifications',
        actions: {
          view: true,
          delete: canDeleteNotifications
        },
        showPermissionError: true
      }}
      onRefresh={handleRefresh}
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
      globalFilterFn={(row, columnId, filterValue) => {
        const notification = row.original as Notification;
        const searchValue = filterValue.toLowerCase();

        return (
          notification.title.toLowerCase().includes(searchValue) ||
          notification.body.toLowerCase().includes(searchValue) ||
          notification.category.toLowerCase().includes(searchValue) ||
          notification.priority.toLowerCase().includes(searchValue) ||
          getTargetDescription(notification).toLowerCase().includes(searchValue)
        );
      }}
    />
  );
}
