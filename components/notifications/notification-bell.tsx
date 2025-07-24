'use client';

import { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Megaphone,
  AlertTriangle,
  Info,
  BellIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '@/hooks/use-notifications';
import { UserNotification } from '@/types/notifications';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Helper to get an icon based on notification category
const getNotificationIcon = (category?: string) => {
  const iconContainerClass =
    'h-8 w-8 rounded-full flex items-center justify-center';

  switch (category?.toLowerCase()) {
    case 'announcement':
      return (
        <div
          className={`${iconContainerClass} bg-blue-100 dark:bg-blue-900/30`}
        >
          <Megaphone className='h-5 w-5 text-blue-500' />
        </div>
      );
    case 'alert':
    case 'urgent':
      return (
        <div className={`${iconContainerClass} bg-red-100 dark:bg-red-900/30`}>
          <AlertTriangle className='h-5 w-5 text-red-500' />
        </div>
      );
    case 'reminder':
      return (
        <div
          className={`${iconContainerClass} bg-yellow-100 dark:bg-yellow-900/30`}
        >
          <Bell className='h-5 w-5 text-yellow-500' />
        </div>
      );
    default:
      return (
        <div
          className={`${iconContainerClass} bg-gray-100 dark:bg-gray-700/50 default-notification-icon`}
        >
          <BellIcon className='h-5 w-5 text-gray-500' fill='currentColor' />
        </div>
      );
  }
};

// Skeleton component for loading state
function NotificationItemSkeleton() {
  return (
    <div className='flex items-center space-x-4 p-3'>
      <Skeleton className='h-8 w-8 rounded-full' />
      <div className='space-y-2 flex-1'>
        <Skeleton className='h-4 w-3/4' />
        <Skeleton className='h-3 w-1/2' />
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useNotifications();

  const handleNotificationClick = (notification: UserNotification) => {
    if (!notification.read_at) {
      markAsRead(notification.notification_id);
    }
    setIsOpen(false);
    if (notification.notification_id) {
      router.push(`/admin/notifications/${notification.notification_id}`);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative rounded-full notification-bell-trigger'
        >
          <Bell className='h-5 w-5' />
          {unreadCount > 0 && (
            <Badge
              variant='destructive'
              className='absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0'
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className='w-96' align='end' sideOffset={8}>
        <div className='flex items-center justify-between p-3 border-b'>
          <h4 className='font-semibold text-lg'>Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant='link'
              size='sm'
              onClick={() => markAllAsRead()}
              className='text-xs h-auto p-0'
            >
              <CheckCheck className='h-3 w-3 mr-1' />
              Mark all as read
            </Button>
          )}
        </div>

        <ScrollArea className='max-h-[400px]'>
          {isLoading ? (
            <div>
              <NotificationItemSkeleton />
              <NotificationItemSkeleton />
              <NotificationItemSkeleton />
            </div>
          ) : notifications.length === 0 ? (
            <div className='text-center p-8 text-muted-foreground'>
              <Bell className='mx-auto h-12 w-12 mb-4 text-gray-300' />
              <h5 className='font-semibold'>No new notifications</h5>
              <p className='text-sm mt-1'>You&apos;re all caught up!</p>
            </div>
          ) : (
            <div>
              {notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className={`p-0 focus:bg-accent cursor-pointer transition-colors ${
                    !notification.read_at
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className='flex items-start gap-3 w-full p-3'>
                    <div className='flex-shrink-0'>
                      {getNotificationIcon(notification.notification?.category)}
                    </div>
                    <div className='flex-1 space-y-1'>
                      <p className='text-sm font-medium leading-tight'>
                        {notification.notification?.title}
                      </p>
                      <p className='text-xs text-muted-foreground line-clamp-2'>
                        {notification.notification?.body}
                      </p>
                      <p className='text-xs text-muted-foreground/80 pt-1'>
                        {notification.notification?.sent_at &&
                          formatDistanceToNow(
                            new Date(notification.notification.sent_at),
                            { addSuffix: true }
                          )}
                      </p>
                    </div>
                    {!notification.read_at && (
                      <div
                        className='w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-1'
                        title='Unread'
                      />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </ScrollArea>

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href='/admin/notifications'
            className='w-full text-center p-3 text-sm font-medium text-primary hover:bg-accent cursor-pointer'
          >
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
