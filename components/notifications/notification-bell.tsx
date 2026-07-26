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
  useDeleteAllRead,
  UNREAD_PREVIEW_LIMIT
} from '@/hooks/notification/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import { NotificationItem } from './notification-item';
import { collapseDuplicates } from '@/lib/notifications/collapse-duplicates';
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
  const { data, isLoading } = useUnreadNotifications(user?.id);
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteAllRead = useDeleteAllRead();

  // `notifications` is a PREVIEW (the few rows this dropdown renders), so its
  // length is not the unread tally. The tally comes from a real COUNT query on
  // GET /api/notifications (`unread_count`, global by contract). Until
  // 2026-07-15 the bell fetched every unread row fully joined, on a 30s poll,
  // just to read `.length` — an array length standing in for a COUNT.
  const notifications = data?.notifications ?? [];
  // Fold near-duplicate repeats (e.g. 20 hourly "AI runner appears down") into a
  // single row with a count — exactly like the full inbox. The bell was rendering
  // every raw copy, drowning out everything else. Display-only: clicking still
  // opens the representative.
  const foldedNotifications = collapseDuplicates(notifications);
  const unreadCount = data?.unreadCount ?? 0;

  const handleNotificationClick = async (
    notificationId: string,
    actionUrl?: string
  ) => {
    await markAsRead.mutateAsync(notificationId);
    // Always navigate so a click never silently no-ops. Most notifications
    // carry an action_url; dashboard:* digests have historically shipped with
    // url=null, so the click would mark-as-read but go nowhere, making the
    // dropdown feel broken. Fallback to /notifications (the full list) so the
    // user always lands somewhere — never on a 404.
    router.push(actionUrl || '/notifications');
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
              // Real number, no '9+' cap: a director with 257 unread was shown
              // '9+', which reads as "about ten" and hides the actual backlog.
              // The badge grows into a pill instead of clipping — the old fixed
              // h-5 w-5 square could not hold three digits. tabular-nums keeps
              // the width from jittering as the count ticks; the ring separates
              // it from the bell glyph underneath.
              <Badge
                variant='destructive'
                className='absolute -top-1 -right-1 h-5 min-w-[1.25rem] w-auto flex items-center justify-center rounded-full px-1 py-0 text-[10px] font-bold leading-none tabular-nums ring-2 ring-background'
              >
                {unreadCount}
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
                {foldedNotifications
                  .slice(0, UNREAD_PREVIEW_LIMIT)
                  .map((notification) => {
                    const stackCount = notification.__stackCount || 1;
                    return (
                      <div key={notification.id} className='relative'>
                        <NotificationItem
                          notification={notification}
                          onClick={() =>
                            handleNotificationClick(
                              notification.id,
                              notification.action_url
                            )
                          }
                        />
                        {stackCount > 1 && (
                          <Badge
                            variant='secondary'
                            className='absolute right-3 top-3 text-[10px] px-1.5 py-0 pointer-events-none'
                          >
                            ×{stackCount}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
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
