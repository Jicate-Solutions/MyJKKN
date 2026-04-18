'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { NotificationStats } from './_components/notification-stats';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NotificationFilters } from './_components/notification-filters';
import { NotificationCategoryTabs } from './_components/notification-category-tabs';
import { NotificationsCardGrid } from './_components/notifications-card-grid';
import {
  Notification,
  NotificationStats as NotificationStatsType
} from '@/types/notifications';
import { NotificationsPageSkeleton } from './_components/notifications-page-skeleton';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const { canAccess } = usePermissions();

  const canCreateNotifications = canAccess('notifications', 'create');

  const fetchData = useCallback(async (search = '') => {
    setIsLoading(true);
    setError(null);

    try {
      const notificationsPromise = fetch(
        `/api/admin/notifications?search=${search}`
      );
      const statsPromise = fetch('/api/admin/notifications/stats');

      const [notificationsResponse, statsResponse] = await Promise.all([
        notificationsPromise,
        statsPromise
      ]);

      if (!notificationsResponse.ok) {
        throw new Error('Failed to fetch notifications');
      }
      if (!statsResponse.ok) {
        throw new Error('Failed to fetch notification statistics');
      }

      const notificationsData = await notificationsResponse.json();
      const statsData = await statsResponse.json();

      setNotifications(notificationsData.notifications || []);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setNotifications([]);
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and search handler
  useEffect(() => {
    fetchData(searchQuery);
  }, [searchQuery, fetchData]);

  const handleSearchChange = (search: string) => {
    setSearchQuery(search);
  };

  const handleRefresh = useCallback(() => {
    fetchData(searchQuery);
  }, [searchQuery, fetchData]);

  return (
    <PermissionGuard
      module='notifications'
      action={['view', 'view.all']}
      anyAction={true}
    >
      <ContentLayout title='Notifications'>
        <div className='space-y-4 sm:space-y-6'>
          <div className='flex-1 space-y-4 px-0 sm:p-4 pt-4 sm:pt-6'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
              <div>
                <h2 className='text-2xl sm:text-3xl font-bold tracking-tight'>
                  Notifications
                </h2>
                <p className='text-sm text-muted-foreground hidden sm:block'>
                  Manage and send notifications to your users
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {canCreateNotifications && (
                  <Link href='/admin/notifications/new'>
                    <Button size='sm' className='h-9'>
                      <Plus className='h-4 w-4 sm:mr-2' />
                      <span className='hidden sm:inline'>Send Notification</span>
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {isLoading ? (
              <NotificationsPageSkeleton />
            ) : error ? (
              <div className='text-center py-8 text-destructive'>
                <p>{error}</p>
                <Button
                  onClick={handleRefresh}
                  variant='outline'
                  className='mt-4'
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <NotificationStats stats={stats} />
                <Card>
                  <CardHeader className='px-3 sm:px-6'>
                    <CardTitle className='text-base sm:text-lg'>Recent Notifications</CardTitle>
                    <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2'>
                      <CardDescription className='hidden sm:block'>
                        A list of all notifications sent through the system
                      </CardDescription>
                      <NotificationFilters
                        onSearchChange={handleSearchChange}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className='px-3 sm:px-6 space-y-4'>
                    <NotificationCategoryTabs
                      notifications={notifications}
                      activeCategory={activeCategory}
                      onCategoryChange={setActiveCategory}
                    />
                    <NotificationsCardGrid
                      notifications={notifications}
                      activeCategory={activeCategory}
                      onRefresh={handleRefresh}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
