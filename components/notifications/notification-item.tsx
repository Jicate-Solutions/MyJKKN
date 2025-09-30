// components/notifications/notification-item.tsx
'use client';

import { Info, CheckCircle2, AlertTriangle, XCircle, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Notification, NotificationType } from '@/types/notification';
import { formatDistanceToNow } from 'date-fns';

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
        return <CheckCircle2 className='h-5 w-5 text-green-600' />;
      case 'warning':
        return <AlertTriangle className='h-5 w-5 text-yellow-600' />;
      case 'error':
        return <XCircle className='h-5 w-5 text-red-600' />;
      case 'reminder':
        return <Bell className='h-5 w-5 text-blue-600' />;
      default:
        return <Info className='h-5 w-5 text-blue-600' />;
    }
  };

  const getTypeColor = (type: NotificationType) => {
    switch (type) {
      case 'success':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'reminder':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
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
        <Badge variant='default' className='text-xs bg-orange-500'>
          High
        </Badge>
      );
    }
    return null;
  };

  return (
    <div
      className={cn(
        'p-4 hover:bg-gray-50 transition-colors cursor-pointer border-l-4',
        !notification.is_read && 'bg-blue-50/50',
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

          <p
            className={cn(
              'text-sm text-muted-foreground',
              !showFullMessage && 'line-clamp-2'
            )}
          >
            {notification.message}
          </p>

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
              <span className='text-xs text-blue-600 hover:underline'>
                {notification.action_label} →
              </span>
            </div>
          )}
        </div>

        {!notification.is_read && (
          <div className='flex-shrink-0'>
            <div className='h-2 w-2 bg-blue-600 rounded-full' />
          </div>
        )}
      </div>
    </div>
  );
}
