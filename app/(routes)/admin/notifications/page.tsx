'use client';

import { Suspense } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { NotificationStats } from './_components/notification-stats';
import { NotificationsDataTable } from './_components/notifications-data-table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';

export default function NotificationsPage() {
  const { canAccess } = usePermissions();
  const canCreateNotifications =
    canAccess('notifications', 'create') || canAccess('notifications', 'send');

  return (
    <PermissionGuard
      module='notifications'
      action={['view', 'view.all']}
      anyAction={true}
    >
      <ContentLayout title='Notifications'>
        <div className='space-y-6'>
          <div className='flex-1 space-y-4 p-4 pt-6'>
            <div className='flex items-center justify-between space-y-2'>
              <div>
                <h2 className='text-3xl font-bold tracking-tight'>
                  Notifications
                </h2>
                <p className='text-muted-foreground'>
                  Manage and send notifications to your users
                </p>
              </div>
              <div className='flex items-center space-x-2'>
                {canCreateNotifications && (
                  <Link href='/admin/notifications/new'>
                    <Button>
                      <Plus className='mr-2 h-4 w-4' />
                      Send Notification
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            <NotificationStats />

            <Card>
              <CardHeader>
                <CardTitle>Recent Notifications</CardTitle>
                <CardDescription>
                  A list of all notifications sent through the system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div>Loading notifications...</div>}>
                  <NotificationsDataTable />
                </Suspense>
              </CardContent>
            </Card>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
