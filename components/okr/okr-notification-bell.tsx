// ============================================================================
// OKR Notification Bell Component
// Displays OKR-specific notifications in a popover
// ============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Target,
  Clock,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  PartyPopper,
  Shield,
  CheckCircle,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useOKRNotifications,
  type OKRNotification
} from '@/hooks/okr/use-okr-notifications';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// ============================================================================
// Icon Mapping
// ============================================================================

const NOTIFICATION_ICONS: Record<string, any> = {
  clock: Clock,
  'alert-triangle': AlertTriangle,
  'x-circle': XCircle,
  'alert-octagon': AlertOctagon,
  'party-popper': PartyPopper,
  badge: Shield,
  'check-circle': CheckCircle,
  target: Target
};

// ============================================================================
// Notification Item Component
// ============================================================================

interface NotificationItemProps {
  notification: OKRNotification;
  onClick: () => void;
  getIcon: (n: OKRNotification) => string;
  getColor: (n: OKRNotification) => string;
}

function NotificationItem({
  notification,
  onClick,
  getIcon,
  getColor
}: NotificationItemProps) {
  const iconName = getIcon(notification);
  const colorClass = getColor(notification);
  const IconComponent = NOTIFICATION_ICONS[iconName] || Target;
  const isUnread = !notification.read_at;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50',
        isUnread && 'bg-blue-50/50 dark:bg-blue-950/20'
      )}
    >
      <div className={cn('p-2 rounded-full shrink-0', colorClass)}>
        <IconComponent className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'text-sm font-medium truncate',
              isUnread ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {notification.notification.title}
          </p>
          {isUnread && (
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {notification.notification.body}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true
          })}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
    </button>
  );
}

// ============================================================================
// Main Bell Component
// ============================================================================

interface OKRNotificationBellProps {
  className?: string;
  showBadge?: boolean;
}

export function OKRNotificationBell({
  className,
  showBadge = true
}: OKRNotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    getNotificationIcon,
    getNotificationColor
  } = useOKRNotifications();

  const handleNotificationClick = async (notification: OKRNotification) => {
    // Mark as read
    if (!notification.read_at) {
      await markAsRead(notification.id);
    }

    // Navigate if URL exists
    if (notification.notification.url) {
      setOpen(false);
      router.push(notification.notification.url);
    }
  };

  const handleViewAll = () => {
    setOpen(false);
    router.push('/okr');
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
        >
          <Target className="h-5 w-5" />
          {showBadge && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">OKR Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => fetchNotifications()}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        <ScrollArea className="h-[400px]">
          {isLoading && notifications.length === 0 && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No OKR notifications</p>
              <p className="text-sm mt-1">
                You&apos;ll see reminders and updates here
              </p>
            </div>
          )}

          {notifications.length > 0 && (
            <div className="divide-y">
              {notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={() => handleNotificationClick(notification)}
                  getIcon={getNotificationIcon}
                  getColor={getNotificationColor}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between p-2 border-t bg-muted/30">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs"
              >
                Mark all as read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleViewAll}
              className="text-xs ml-auto"
            >
              View all OKRs
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default OKRNotificationBell;
