// components/notifications/notification-bell.tsx
'use client';

import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useUnreadNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteAllRead
} from '@/hooks/notification/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { NotificationItem } from './notification-item';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

export function NotificationBell() {
  const router = useRouter();
  const { profile: user } = useAuth();
  const { data: notifications = [], isLoading } = useUnreadNotifications(
    user?.id
  );
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteAllRead = useDeleteAllRead();

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

  const handleMarkAllRead = () => {
    if (!user?.id) return;
    markAllAsRead.mutate(user.id);
  };

  const handleClearAll = () => {
    if (!user?.id) return;
    // Mark all as read first, then delete all read in sequence
    markAllAsRead.mutate(user.id, {
      onSuccess: () => {
        deleteAllRead.mutate(user.id);
      }
    });
  };

  const handleViewAll = () => {
    router.push('/notifications');
  };

  const isActioning =
    markAllAsRead.isPending || deleteAllRead.isPending;

  return (
    <TooltipProvider delayDuration={200}>
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
          {/* Header */}
          <div className='flex items-center justify-between px-4 py-3 border-b'>
            <div className='flex items-center gap-2'>
              <h3 className='font-semibold text-sm'>Notifications</h3>
              {unreadCount > 0 && (
                <Badge variant='secondary' className='h-5 px-1.5 text-xs'>
                  {unreadCount} new
                </Badge>
              )}
            </div>

            {unreadCount > 0 && (
              <div className='flex items-center gap-1'>
                {/* Mark all as read */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7 text-muted-foreground hover:text-foreground'
                      onClick={handleMarkAllRead}
                      disabled={isActioning}
                    >
                      <CheckCheck className='h-3.5 w-3.5' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side='bottom'>
                    <p className='text-xs'>Mark all as read</p>
                  </TooltipContent>
                </Tooltip>

                {/* Clear all (mark read + delete) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7 text-muted-foreground hover:text-destructive'
                      onClick={handleClearAll}
                      disabled={isActioning}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side='bottom'>
                    <p className='text-xs'>Clear all notifications</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {/* List */}
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
                <p className='text-sm font-medium'>All caught up!</p>
                <p className='text-xs mt-0.5 opacity-70'>No new notifications</p>
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

          {/* Footer */}
          {notifications.length > 0 && (
            <>
              <Separator />
              <div className='p-2'>
                <Button
                  variant='ghost'
                  className='w-full text-sm h-8'
                  onClick={handleViewAll}
                >
                  View all notifications
                </Button>
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
