'use client';

import { useCallback } from 'react';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Users, Trash2, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Notification } from '@/types/notifications';
import { usePermissions } from '@/hooks/use-permissions';
import { useRoles } from '@/hooks/organization/use-roles';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

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
  const { canAccess } = usePermissions();
  const { data: rolesData } = useRoles({ includeSystemRoles: true });

  const canDeleteNotifications = canAccess('notifications', 'delete');

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

  const getTargetDescription = (notification: any) => {
    // Handle both the new targeting object structure and legacy individual fields
    const targeting = notification.targeting || {};

    const parts = [];
    if (targeting.institution_id || notification.target_institution_id)
      parts.push('Institution');
    if (targeting.department_id || notification.target_department_id)
      parts.push('Department');
    if (targeting.program_id || notification.target_program_id)
      parts.push('Program');
    if (targeting.semester || notification.target_semester) {
      const semester = targeting.semester || notification.target_semester;
      parts.push(`Semester ${semester}`);
    }
    if (targeting.section || notification.target_section) {
      const section = targeting.section || notification.target_section;
      parts.push(`Section ${section}`);
    }
    if (targeting.target_roles && targeting.target_roles.length > 0) {
      const roleNames = targeting.target_roles.map((roleKey: string) => {
        const role = rolesData?.find((r) => r.role_key === roleKey);
        return role ? role.role_name : roleKey;
      });
      parts.push(`Roles: ${roleNames.join(', ')}`);
    }

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
            <Link
              href={`/admin/notifications/${notification.id}`}
              className='hover:text-primary'
            >
              <div className='font-medium'>{notification.title}</div>
              <div className='text-sm text-muted-foreground line-clamp-2'>
                {notification.body}
              </div>
            </Link>
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' size='sm' title='Actions'>
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem asChild>
                <Link
                  href={`/admin/notifications/${notification.id}`}
                  className='flex items-center w-full'
                >
                  <Eye className='mr-2 h-4 w-4' />
                  View Details
                </Link>
              </DropdownMenuItem>
              {canDeleteNotifications && (
                <DropdownMenuItem
                  onClick={() => handleDeleteNotification(notification.id)}
                  className='text-red-600 focus:text-red-600 focus:bg-red-50'
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </DropdownMenuItem>
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
    <DataTable
      columns={columns}
      data={notifications}
      searchPlaceholder='Search notifications...' // This will be handled by the parent component now
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
  );
}
