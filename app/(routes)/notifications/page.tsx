// app/(routes)/notifications/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Archive, Trash2, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationItem } from '@/components/notifications/notification-item';
import {
  useNotifications,
  useMarkAllAsRead,
  useDeleteAllRead,
  useMarkAsRead
} from '@/hooks/notification/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { NotificationCategory, NotificationType } from '@/types/notification';

export default function NotificationsPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data: allNotifications = [], isLoading } = useNotifications({
    user_id: user?.id
  });
  const markAllAsRead = useMarkAllAsRead();
  const deleteAllRead = useDeleteAllRead();
  const markAsRead = useMarkAsRead();

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    let filtered = [...allNotifications];

    // Tab filter
    if (activeTab === 'unread') {
      filtered = filtered.filter((n) => !n.is_read && !n.is_archived);
    } else if (activeTab === 'read') {
      filtered = filtered.filter((n) => n.is_read && !n.is_archived);
    } else if (activeTab === 'archived') {
      filtered = filtered.filter((n) => n.is_archived);
    } else if (activeTab !== 'all') {
      filtered = filtered.filter((n) => !n.is_archived);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.message.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((n) => n.category === categoryFilter);
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((n) => n.type === typeFilter);
    }

    return filtered;
  }, [allNotifications, activeTab, searchQuery, categoryFilter, typeFilter]);

  // Calculate counts
  const counts = useMemo(() => {
    return {
      all: allNotifications.filter((n) => !n.is_archived).length,
      unread: allNotifications.filter((n) => !n.is_read && !n.is_archived)
        .length,
      read: allNotifications.filter((n) => n.is_read && !n.is_archived).length,
      archived: allNotifications.filter((n) => n.is_archived).length
    };
  }, [allNotifications]);

  const handleMarkAllAsRead = async () => {
    if (user?.id) {
      await markAllAsRead.mutateAsync(user.id);
    }
  };

  const handleDeleteAllRead = async () => {
    if (user?.id) {
      await deleteAllRead.mutateAsync(user.id);
    }
  };

  const handleNotificationClick = async (
    notificationId: string,
    actionUrl?: string
  ) => {
    await markAsRead.mutateAsync(notificationId);
    if (actionUrl) {
      router.push(actionUrl);
    }
  };

  return (
    <ContentLayout title='Notifications'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Notifications</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <Bell className='h-8 w-8' />
            Notifications
          </h1>
          <p className='text-muted-foreground'>
            Stay updated with your latest notifications
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleMarkAllAsRead}
            disabled={counts.unread === 0}
          >
            <CheckCheck className='mr-2 h-4 w-4' />
            Mark all read
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={handleDeleteAllRead}
            disabled={counts.read === 0}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete read
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => router.push('/notifications/settings')}
          >
            <Settings className='mr-2 h-4 w-4' />
            Settings
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className='flex items-center gap-4 mb-6'>
        <Input
          placeholder='Search notifications...'
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className='max-w-sm'
        />

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Category' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Categories</SelectItem>
            {Object.values(NotificationCategory).map((category) => (
              <SelectItem key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className='w-[180px]'>
            <SelectValue placeholder='Type' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Types</SelectItem>
            {Object.values(NotificationType).map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <TabsList>
          <TabsTrigger value='all'>
            All <span className='ml-2 text-xs'>({counts.all})</span>
          </TabsTrigger>
          <TabsTrigger value='unread'>
            Unread <span className='ml-2 text-xs'>({counts.unread})</span>
          </TabsTrigger>
          <TabsTrigger value='read'>
            Read <span className='ml-2 text-xs'>({counts.read})</span>
          </TabsTrigger>
          <TabsTrigger value='archived'>
            Archived <span className='ml-2 text-xs'>({counts.archived})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className='space-y-4'>
          {/* Results Count */}
          <div className='flex items-center justify-between'>
            <p className='text-sm text-muted-foreground'>
              {isLoading ? (
                'Loading notifications...'
              ) : (
                <>
                  <span className='font-semibold'>
                    {filteredNotifications.length}
                  </span>{' '}
                  notification{filteredNotifications.length !== 1 ? 's' : ''}{' '}
                  found
                </>
              )}
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className='p-4 border rounded-lg space-y-2'>
                  <Skeleton className='h-4 w-3/4' />
                  <Skeleton className='h-3 w-full' />
                  <Skeleton className='h-3 w-1/2' />
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredNotifications.length === 0 && (
            <div className='py-12 text-center'>
              <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100'>
                <Bell className='h-8 w-8 text-gray-600' />
              </div>
              <h3 className='mb-2 text-lg font-semibold'>
                No notifications found
              </h3>
              <p className='text-sm text-muted-foreground'>
                {searchQuery || categoryFilter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : "You're all caught up!"}
              </p>
            </div>
          )}

          {/* Notifications List */}
          {!isLoading && filteredNotifications.length > 0 && (
            <div className='border rounded-lg divide-y'>
              {filteredNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={() =>
                    handleNotificationClick(
                      notification.id,
                      notification.action_url
                    )
                  }
                  showFullMessage
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ContentLayout>
  );
}
