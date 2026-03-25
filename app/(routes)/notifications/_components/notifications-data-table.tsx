'use client';

import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import type {
  DataFetchParams,
  DataFetchResult
} from '@/components/data-table/data-table';
import { getColumns } from './columns';
import type { NotificationWithStats } from '@/types/notification';
import { getNotificationsManage } from '@/lib/services/notification/notification-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { EditNotificationDialog } from './edit-notification-dialog';

interface NotificationsDataTableProps {
  refetchKey?: number;
}

export function NotificationsDataTable({
  refetchKey: externalRefetchKey = 0
}: NotificationsDataTableProps) {
  const router = useRouter();
  const {
    canAccess,
    isSuperAdmin,
    userProfile,
    isLoading: permissionsLoading
  } = usePermissions();

  const isReady = !permissionsLoading && !!userProfile;

  const canCreateNotification =
    isSuperAdmin ||
    canAccess('notifications', 'create') ||
    canAccess('notifications', 'send');

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNotification, setEditingNotification] =
    useState<NotificationWithStats | null>(null);
  const [internalRefetchKey, setInternalRefetchKey] = useState(0);

  const handleEdit = useCallback((notification: NotificationWithStats) => {
    setEditingNotification(notification);
    setEditDialogOpen(true);
  }, []);

  const handleReuse = useCallback(
    (notification: NotificationWithStats) => {
      // Navigate to the send form with pre-filled data via query params
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

  const handleEditSuccess = useCallback(() => {
    setInternalRefetchKey((prev) => prev + 1);
  }, []);

  // Build columns with action callbacks - memoize the full column array
  const columns = useMemo(
    () =>
      getColumns({
        onEdit: handleEdit,
        onReuse: handleReuse
      }),
    [handleEdit, handleReuse]
  );

  // Stable getColumns wrapper for DataTable (avoids re-renders)
  const getColumnsStable = useCallback(
    () => columns as any,
    [columns]
  );

  const fetchData = useCallback(
    async (
      params: DataFetchParams
    ): Promise<DataFetchResult<NotificationWithStats>> => {
      try {
        const result = await getNotificationsManage({
          page: params.page,
          limit: params.limit,
          search: params.search || '',
          sort_by: params.sort_by || 'created_at',
          sort_order: params.sort_order || 'desc'
        });

        return {
          success: true,
          data: result.data,
          pagination: result.pagination
        };
      } catch (error) {
        logger.error(
          'notifications',
          'Failed to fetch notifications for management',
          error
        );
        return {
          success: false,
          data: [],
          pagination: {
            page: 1,
            limit: params.limit,
            total_pages: 0,
            total_items: 0
          }
        };
      }
    },
    []
  );

  const renderCustomToolbar = useCallback(
    (props: {
      selectedRows: any[];
      allSelectedIds: (string | number)[];
      totalSelectedCount: number;
      resetSelection: () => void;
    }) => (
      <div className='flex items-center gap-2'>
        {canCreateNotification && (
          <Button
            onClick={() => router.push('/admin/notifications/new')}
            size='sm'
            className='h-8'
          >
            <Plus className='mr-2 h-4 w-4' />
            Send Notification
          </Button>
        )}
        <Button
          variant='outline'
          onClick={() => router.push('/notifications/settings')}
          size='sm'
          className='h-8'
        >
          <Settings className='mr-2 h-4 w-4' />
          Settings
        </Button>
      </div>
    ),
    [canCreateNotification, router]
  );

  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <DataTable
        key={`${internalRefetchKey}-${externalRefetchKey}`}
        fetchDataFn={fetchData}
        getColumns={getColumnsStable}
        idField='id'
        config={{
          enableUrlState: true,
          enableDateFilter: false,
          enableExport: false,
          enableRowSelection: true,
          enableSearch: true,
          enableColumnFilters: false,
          enableColumnVisibility: true,
          enableColumnResizing: true,
          columnResizingTableId: 'notifications-manage-table'
        }}
        exportConfig={{
          entityName: 'notifications',
          columnMapping: {
            title: 'Title',
            body: 'Message',
            priority: 'Priority',
            category: 'Category',
            sent_to_count: 'Sent To',
            read_by_count: 'Read By',
            created_at: 'Sent At'
          },
          columnWidths: [
            { wch: 30 },
            { wch: 50 },
            { wch: 10 },
            { wch: 15 },
            { wch: 10 },
            { wch: 10 },
            { wch: 20 }
          ],
          headers: [
            'title',
            'body',
            'priority',
            'category',
            'sent_to_count',
            'read_by_count',
            'created_at'
          ]
        }}
        renderToolbarContent={renderCustomToolbar}
        refetchKey={internalRefetchKey + externalRefetchKey}
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
