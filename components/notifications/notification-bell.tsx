// components/notifications/notification-bell.tsx
'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useUnreadNotifications,
  useMarkAsRead
} from '@/hooks/notification/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { NotificationItem } from './notification-item';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';

export function NotificationBell() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const { data: notifications = [], isLoading } = useUnreadNotifications(
    user?.id
  );
  const markAsRead = useMarkAsRead();

  const unreadCount = notifications.length;

  const handleNotificationClick = async (
    notificationId: string,
    actionUrl?: string
  ) => {
    await markAsRead.mutateAsync(notificationId);
    if (actionUrl) {
      router.push(actionUrl);
    }
  };

  const handleViewAll = () => {
    router.push('/notifications');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='icon' className='relative'>
          <Bell className='h-5 w-5' />
          {unreadCount > 0 && (
            <Badge
              variant='destructive'
              className='absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs'
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-80 p-0' align='end'>
        <div className='flex items-center justify-between p-4 border-b'>
          <h3 className='font-semibold'>Notifications</h3>
          {unreadCount > 0 && (
            <Badge variant='secondary'>{unreadCount} new</Badge>
          )}
        </div>

        <ScrollArea className='h-[400px]'>
          {isLoading && (
            <div className='p-4 space-y-3'>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className='space-y-2'>
                  <Skeleton className='h-4 w-full' />
                  <Skeleton className='h-3 w-3/4' />
                </div>
              ))}
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className='p-8 text-center text-muted-foreground'>
              <Bell className='h-12 w-12 mx-auto mb-2 opacity-20' />
              <p>No new notifications</p>
            </div>
          )}

          {!isLoading && notifications.length > 0 && (
            <div className='divide-y'>
              {notifications.slice(0, 5).map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={() =>
                    handleNotificationClick(
                      notification.id,
                      notification.action_url
                    )
                  }
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className='p-2 border-t'>
            <Button variant='ghost' className='w-full' onClick={handleViewAll}>
              View all notifications
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
