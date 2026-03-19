// components/notifications/notification-item.tsx
'use client';

import { Info, CheckCircle2, AlertTriangle, XCircle, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Notification, NotificationType } from '@/types/notification';
import { formatDistanceToNow } from 'date-fns';
import { RichTextDisplay, stripHtml } from '@/components/ui/rich-text-editor';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
  showFullMessage?: boolean;
}

export function NotificationItem({
  notification,
  onClick,
  showFullMessage = false
}: NotificationItemProps) {
  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className='h-5 w-5 text-green-600 dark:text-green-400' />;
      case 'warning':
        return <AlertTriangle className='h-5 w-5 text-yellow-600 dark:text-yellow-400' />;
      case 'error':
        return <XCircle className='h-5 w-5 text-red-600 dark:text-red-400' />;
      case 'reminder':
        return <Bell className='h-5 w-5 text-blue-600 dark:text-blue-400' />;
      default:
        return <Info className='h-5 w-5 text-blue-600 dark:text-blue-400' />;
    }
  };

  const getTypeColor = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
      case 'warning':
        return 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
      case 'error':
        return 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
      case 'reminder':
        return 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
      default:
        return 'text-foreground bg-muted/30 border-border';
    }
  };

  const getPriorityBadge = () => {
    if (notification.priority === 'urgent') {
      return (
        <Badge variant='destructive' className='text-xs'>
          Urgent
        </Badge>
      );
    }
    if (notification.priority === 'high') {
      return (
        <Badge variant='default' className='text-xs bg-orange-500 dark:bg-orange-600'>
          High
        </Badge>
      );
    }
    return null;
  };

  return (
    <div
      className={cn(
        'p-3 sm:p-4 hover:bg-muted/50 transition-colors cursor-pointer border-l-4',
        !notification.is_read && 'bg-blue-50/50 dark:bg-blue-950/20',
        getTypeColor(notification.type)
      )}
      onClick={onClick}
    >
      <div className='flex gap-3'>
        <div className='flex-shrink-0 mt-0.5'>{getIcon(notification.type)}</div>

        <div className='flex-1 min-w-0 space-y-1'>
          <div className='flex items-start justify-between gap-2'>
            <h4 className='font-semibold text-sm line-clamp-1'>
              {notification.title}
            </h4>
            {getPriorityBadge()}
          </div>

          {showFullMessage ? (
            <RichTextDisplay
              content={notification.message}
              className='text-sm text-muted-foreground'
            />
          ) : (
            <p className='text-sm text-muted-foreground line-clamp-2'>
              {stripHtml(notification.message)}
            </p>
          )}

          <div className='flex items-center gap-3 text-xs text-muted-foreground'>
            <span>
              {formatDistanceToNow(new Date(notification.created_at), {
                addSuffix: true
              })}
            </span>
            {notification.category && (
              <>
                <span>•</span>
                <Badge variant='outline' className='text-xs capitalize'>
                  {notification.category}
                </Badge>
              </>
            )}
          </div>

          {notification.action_url && notification.action_label && (
            <div className='pt-1'>
              <span className='text-xs text-blue-600 dark:text-blue-400 hover:underline'>
                {notification.action_label} →
              </span>
            </div>
          )}
        </div>

        {!notification.is_read && (
          <div className='flex-shrink-0'>
            <div className='h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full' />
          </div>
        )}
      </div>
    </div>
  );
}
