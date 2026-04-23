'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Megaphone,
  Calendar,
  AlertTriangle,
  Clock,
  Info,
  Bell
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Notification } from '@/types/notifications';
import { stripHtml } from '@/components/ui/rich-text-editor';
import { NotificationActionButtons } from './notification-action-buttons';

// ---- Styling helpers ----

function getPriorityBadgeClass(priority: string) {
  switch (priority) {
    case 'urgent':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'normal':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'low':
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function getCategoryStyle(category: string): {
  bar: string;
  pill: string;
  icon: React.ReactNode;
} {
  switch (category) {
    case 'announcements':
      return {
        bar: 'bg-blue-500',
        pill: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: <Megaphone className='h-3 w-3' />
      };
    case 'reminders':
      return {
        bar: 'bg-amber-500',
        pill: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: <Clock className='h-3 w-3' />
      };
    case 'events':
      return {
        bar: 'bg-green-500',
        pill: 'bg-green-50 text-green-700 border-green-200',
        icon: <Calendar className='h-3 w-3' />
      };
    case 'alerts':
      return {
        bar: 'bg-red-500',
        pill: 'bg-red-50 text-red-700 border-red-200',
        icon: <AlertTriangle className='h-3 w-3' />
      };
    case 'general':
    default:
      return {
        bar: 'bg-gray-400',
        pill: 'bg-gray-50 text-gray-700 border-gray-200',
        icon: <Info className='h-3 w-3' />
      };
  }
}

// ---- Props ----

interface NotificationCardProps {
  notification: Notification;
  canDelete: boolean;
  onEdit: (notification: Notification) => void;
  onReuse: (notification: Notification) => void;
  onDelete: (notificationId: string) => void;
}

/**
 * Card component for a single notification.
 *
 * Usage:
 * <NotificationCard
 *   notification={notification}
 *   canDelete={canAccess('notifications', 'delete')}
 *   onEdit={handleEdit}
 *   onReuse={handleReuse}
 *   onDelete={handleDelete}
 * />
 */
export function NotificationCard({
  notification,
  canDelete,
  onEdit,
  onReuse,
  onDelete
}: NotificationCardProps) {
  const categoryStyle = getCategoryStyle(notification.category);
  const priorityClass = getPriorityBadgeClass(notification.priority);
  const bodyPreview = stripHtml(notification.body);

  const sentDate = notification.sent_at
    ? formatDistanceToNow(new Date(notification.sent_at), { addSuffix: true })
    : formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  return (
    <div className='group relative rounded-lg border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow overflow-hidden'>
      {/* Category color bar on the left */}
      <div
        className={cn('absolute left-0 top-0 bottom-0 w-1', categoryStyle.bar)}
        aria-hidden='true'
      />

      {/* Card content — the whole card is a Link, except the overflow menu */}
      <Link
        href={`/admin/notifications/${notification.id}`}
        className='block pl-4 pr-10 pt-3 pb-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        aria-label={`View notification: ${notification.title}`}
      >
        {/* Top row: category pill + relative time */}
        <div className='flex items-center justify-between gap-2 mb-1.5'>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded border',
              categoryStyle.pill
            )}
          >
            {categoryStyle.icon}
            <span className='capitalize'>{notification.category}</span>
          </span>
          <span className='text-[11px] text-muted-foreground shrink-0'>
            {sentDate}
          </span>
        </div>

        {/* Title */}
        <p className='font-semibold text-sm leading-snug line-clamp-1 mb-1'>
          {notification.title}
        </p>

        {/* Body preview */}
        <p className='text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2'>
          {bodyPreview || 'No preview available'}
        </p>

        {/* Bottom row: priority badge + optional indicators */}
        <div className='flex items-center gap-1.5'>
          <span
            className={cn(
              'inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border capitalize',
              priorityClass
            )}
          >
            {notification.priority}
          </span>
          {/* Show bell icon as an action indicator placeholder */}
          <Bell className='h-3 w-3 text-muted-foreground/60' aria-label='Notification' />
        </div>
      </Link>

      {/* Action buttons — render whenever action_config is present. Handles
          both admin-form notifications (action_type='tracked'|'urgent') AND
          dashboard-cron notifications (action_type='open_url'). The component
          decides what to render based on the action_config shape; self-hides
          when nothing is actionable. Lives outside the Link so button clicks
          don't trigger card navigation. */}
      {(notification as any).action_config && (
        <div className='px-4 pb-3'>
          <NotificationActionButtons
            notificationId={notification.id}
            actionType={(notification as any).action_type}
            actionConfig={(notification as any).action_config}
            category={notification.category}
          />
        </div>
      )}

      {/* Overflow menu — positioned absolute, outside the Link */}
      <div className='absolute top-2 right-2' onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity'
              aria-label='Notification actions'
            >
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-44'>
            <DropdownMenuItem onSelect={() => onEdit(notification)}>
              <Pencil className='mr-2 h-4 w-4' />
              Edit Message
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReuse(notification)}>
              <Copy className='mr-2 h-4 w-4' />
              Reuse Message
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => onDelete(notification.id)}
                  className='text-red-600 focus:text-red-600 focus:bg-red-50'
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
