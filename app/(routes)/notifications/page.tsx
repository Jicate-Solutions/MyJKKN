// app/(routes)/notifications/page.tsx
'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Bell,
  CheckCheck,
  Trash2,
  Settings,
  Search,
  Filter,
  X,
  BellOff,
  Inbox,
  MailOpen,
  Archive
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
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
import { cn } from '@/lib/utils';

export default function NotificationsPage() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

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

  const hasActiveFilters = categoryFilter !== 'all' || typeFilter !== 'all';

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

  const clearFilters = () => {
    setCategoryFilter('all');
    setTypeFilter('all');
    setSearchQuery('');
  };

  const tabs = [
    { id: 'all', label: 'All', count: counts.all, icon: Inbox },
    { id: 'unread', label: 'Unread', count: counts.unread, icon: Bell },
    { id: 'read', label: 'Read', count: counts.read, icon: MailOpen },
    { id: 'archived', label: 'Archived', count: counts.archived, icon: Archive }
  ];

  return (
    <ContentLayout title='Notifications'>
      {/* Breadcrumb — hidden on mobile for space */}
      <Breadcrumb className='mb-4 hidden sm:block'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Notifications</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header — stacks on mobile */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4'>
        <div>
          <h1 className='text-2xl sm:text-3xl font-bold flex items-center gap-2'>
            <Bell className='h-6 w-6 sm:h-8 sm:w-8' />
            Notifications
            {counts.unread > 0 && (
              <span className='inline-flex items-center justify-center h-6 min-w-6 px-1.5 text-xs font-bold text-white bg-blue-600 rounded-full'>
                {counts.unread}
              </span>
            )}
          </h1>
          <p className='text-sm text-muted-foreground hidden sm:block'>
            Stay updated with your latest notifications
          </p>
        </div>

        {/* Action buttons — icon-only on mobile */}
        <div className='flex items-center gap-1.5 sm:gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleMarkAllAsRead}
            disabled={counts.unread === 0}
            className='h-8 sm:h-9'
          >
            <CheckCheck className='h-4 w-4 sm:mr-2' />
            <span className='hidden sm:inline'>Mark all read</span>
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={handleDeleteAllRead}
            disabled={counts.read === 0}
            className='h-8 sm:h-9'
          >
            <Trash2 className='h-4 w-4 sm:mr-2' />
            <span className='hidden sm:inline'>Delete read</span>
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => router.push('/notifications/settings')}
            className='h-8 sm:h-9'
          >
            <Settings className='h-4 w-4 sm:mr-2' />
            <span className='hidden sm:inline'>Settings</span>
          </Button>
        </div>
      </div>

      {/* Tab Pills — horizontally scrollable on mobile */}
      <div className='flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide'>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className='h-3.5 w-3.5' />
              {tab.label}
              <span
                className={cn(
                  'inline-flex items-center justify-center h-5 min-w-5 px-1 text-xs rounded-full',
                  activeTab === tab.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-background text-muted-foreground'
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <div className='flex items-center gap-2 mb-4'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search notifications...'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className='pl-9 h-9'
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
            >
              <X className='h-4 w-4' />
            </button>
          )}
        </div>
        <Button
          variant={showFilters || hasActiveFilters ? 'default' : 'outline'}
          size='sm'
          onClick={() => setShowFilters(!showFilters)}
          className='h-9 flex-shrink-0'
        >
          <Filter className='h-4 w-4 sm:mr-2' />
          <span className='hidden sm:inline'>Filters</span>
          {hasActiveFilters && (
            <span className='ml-1 inline-flex items-center justify-center h-4 w-4 text-[10px] rounded-full bg-primary-foreground text-primary'>
              {(categoryFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0)}
            </span>
          )}
        </Button>
      </div>

      {/* Expandable Filters */}
      {showFilters && (
        <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4 p-3 bg-muted/30 rounded-lg border'>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className='w-full sm:w-[180px] h-9'>
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
            <SelectTrigger className='w-full sm:w-[180px] h-9'>
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

          {hasActiveFilters && (
            <Button
              variant='ghost'
              size='sm'
              onClick={clearFilters}
              className='h-9 text-muted-foreground'
            >
              <X className='h-4 w-4 mr-1' />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Results Count */}
      <div className='flex items-center justify-between mb-3'>
        <p className='text-xs sm:text-sm text-muted-foreground'>
          {isLoading ? (
            'Loading...'
          ) : (
            <>
              <span className='font-semibold'>
                {filteredNotifications.length}
              </span>{' '}
              notification{filteredNotifications.length !== 1 ? 's' : ''}
            </>
          )}
        </p>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className='space-y-2'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='p-3 sm:p-4 border rounded-lg space-y-2'>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-3 w-full' />
              <Skeleton className='h-3 w-1/2' />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredNotifications.length === 0 && (
        <div className='py-16 text-center'>
          <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
            <BellOff className='h-8 w-8 text-muted-foreground' />
          </div>
          <h3 className='mb-1 text-lg font-semibold'>
            {activeTab === 'unread'
              ? 'All caught up!'
              : activeTab === 'archived'
                ? 'No archived notifications'
                : 'No notifications found'}
          </h3>
          <p className='text-sm text-muted-foreground max-w-xs mx-auto'>
            {searchQuery || hasActiveFilters
              ? 'Try adjusting your search or filters'
              : activeTab === 'unread'
                ? 'You have no unread notifications right now'
                : "You'll see your notifications here"}
          </p>
          {hasActiveFilters && (
            <Button
              variant='outline'
              size='sm'
              onClick={clearFilters}
              className='mt-4'
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Notifications List */}
      {!isLoading && filteredNotifications.length > 0 && (
        <div className='border rounded-lg divide-y overflow-hidden'>
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
    </ContentLayout>
  );
}
