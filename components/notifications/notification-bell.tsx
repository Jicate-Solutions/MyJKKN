'use client';

import { useState } from 'react';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
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
import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '@/hooks/use-notifications';
import { UserNotification } from '@/types/notifications';
import Link from 'next/link';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    loadMore,
    hasMore
  } = useNotifications();

  const handleNotificationClick = (notification: UserNotification) => {
    // Mark as read if unread
    if (!notification.read_at) {
      markAsRead(notification.notification_id);
    }

    // Close dropdown
    setIsOpen(false);

    // If notification has a URL, open it
    if (notification.notification?.url) {
      window.open(notification.notification.url, '_blank');
    }
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-500';
      case 'high':
        return 'text-orange-500';
      case 'normal':
        return 'text-blue-500';
      case 'low':
        return 'text-gray-500';
      default:
        return 'text-blue-500';
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='sm' className='relative'>
          <Bell className='h-5 w-5' />
          {unreadCount > 0 && (
            <Badge
              variant='destructive'
              className='absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs p-0 min-w-5'
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className='w-80 max-h-96' align='end' sideOffset={5}>
        <div className='flex items-center justify-between p-2'>
          <h4 className='font-medium'>Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant='ghost'
              size='sm'
              onClick={handleMarkAllAsRead}
              className='text-xs'
            >
              <CheckCheck className='h-3 w-3 mr-1' />
              Mark all read
            </Button>
          )}
        </div>

        <DropdownMenuSeparator />

        {isLoading ? (
          <div className='flex justify-center items-center p-4'>
            <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-primary'></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className='text-center p-4 text-muted-foreground'>
            <Bell className='mx-auto h-8 w-8 mb-2 opacity-50' />
            <p className='text-sm'>No notifications yet</p>
          </div>
        ) : (
          <>
            <ScrollArea className='max-h-64'>
              {notifications.slice(0, 10).map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className='p-0 focus:bg-muted'
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className='flex w-full p-3 cursor-pointer'>
                    <div className='flex-1 space-y-1'>
                      <div className='flex items-start justify-between'>
                        <h5
                          className={`text-sm font-medium leading-tight ${
                            !notification.read_at
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {notification.notification?.title}
                        </h5>
                        {!notification.read_at && (
                          <div className='w-2 h-2 bg-blue-500 rounded-full ml-2 mt-1 flex-shrink-0' />
                        )}
                      </div>

                      <p
                        className={`text-xs leading-tight ${
                          !notification.read_at
                            ? 'text-muted-foreground'
                            : 'text-muted-foreground/70'
                        }`}
                      >
                        {notification.notification?.body}
                      </p>

                      <div className='flex items-center justify-between'>
                        <span className='text-xs text-muted-foreground'>
                          {notification.notification?.sent_at &&
                            formatDistanceToNow(
                              new Date(notification.notification.sent_at),
                              {
                                addSuffix: true
                              }
                            )}
                        </span>

                        <div className='flex items-center gap-1'>
                          {notification.notification?.priority && (
                            <div
                              className={`w-1 h-1 rounded-full ${getPriorityColor(
                                notification.notification.priority
                              )}`}
                            />
                          )}
                          {notification.notification?.url && (
                            <ExternalLink className='h-3 w-3 text-muted-foreground' />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </ScrollArea>

            {notifications.length > 10 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href='/notifications'
                    className='w-full text-center p-2 text-sm text-muted-foreground hover:text-foreground'
                  >
                    View all notifications
                  </Link>
                </DropdownMenuItem>
              </>
            )}

            {hasMore && notifications.length <= 10 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={loadMore} className='text-center'>
                  <span className='text-sm text-muted-foreground'>
                    Load more...
                  </span>
                </DropdownMenuItem>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
