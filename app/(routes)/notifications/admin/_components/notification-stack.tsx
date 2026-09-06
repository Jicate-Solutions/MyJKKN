'use client';

/**
 * NotificationStack — collapsible wrapper for a group of near-duplicate notifications.
 *
 * Used by NotificationsCardGrid when a group of ≥3 notifications share the same
 * (category, digit-stripped title pattern). Renders a single compact card with
 * count + category + sample title; expands to show individual NotificationCards.
 *
 * Callback props (onEdit/onReuse/onDelete/canDelete) mirror NotificationCard's
 * interface exactly — the stack passes them straight through to every child
 * card, so stacked notifications retain full edit/reuse/delete capability.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Notification } from '@/types/notifications';
import { NotificationCard } from './notification-card';

export interface NotificationStackGroup {
  /** Group key: `${category_lowercase}|${title_digits_stripped}` */
  key: string;
  /** Prettified common title pattern (digits replaced with "#") */
  titlePattern: string;
  category: string;
  /** All notifications in this group, sorted by sent_at descending */
  notifications: Notification[];
}

interface NotificationStackProps {
  group: NotificationStackGroup;
  canDelete: boolean;
  onEdit: (notification: Notification) => void;
  onReuse: (notification: Notification) => void;
  onDelete: (notificationId: string) => void;
}

// Category-to-color mapping mirrors NotificationCard's palette
function getCategoryColor(category: string): string {
  const lc = category.toLowerCase();
  if (lc.includes('event') || lc.includes('announcement')) return 'bg-blue-500';
  if (lc.includes('alert') || lc.includes('rescue') || lc.includes('warning'))
    return 'bg-red-500';
  if (lc.includes('reminder')) return 'bg-amber-500';
  if (lc.includes('news') || lc.includes('info')) return 'bg-green-500';
  return 'bg-gray-400';
}

function getCategoryBadgeVariant(
  category: string
): 'default' | 'destructive' | 'secondary' | 'outline' {
  const lc = category.toLowerCase();
  if (lc.includes('alert') || lc.includes('rescue') || lc.includes('warning'))
    return 'destructive';
  if (lc.includes('reminder')) return 'secondary';
  return 'outline';
}

export function NotificationStack({
  group,
  canDelete,
  onEdit,
  onReuse,
  onDelete
}: NotificationStackProps) {
  const [expanded, setExpanded] = useState(false);

  const { notifications, category, titlePattern } = group;
  const count = notifications.length;
  const mostRecent = notifications[0];
  const colorBar = getCategoryColor(category);
  const badgeVariant = getCategoryBadgeVariant(category);

  return (
    <div className='rounded-lg border shadow-sm overflow-hidden bg-card text-card-foreground'>
      {/* Stack header */}
      <div className='flex items-start gap-0'>
        <div className={`w-1 self-stretch flex-shrink-0 ${colorBar}`} />

        <div className='flex-1 px-4 py-3 min-w-0'>
          <div className='flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2 min-w-0'>
              <Layers className='h-4 w-4 flex-shrink-0 text-muted-foreground' />
              <span className='text-xl font-bold leading-none tabular-nums'>
                {count}
              </span>
              <span className='text-sm text-muted-foreground hidden sm:inline'>
                notifications
              </span>
            </div>

            <div className='flex items-center gap-2 flex-shrink-0'>
              <Badge
                variant={badgeVariant}
                className='text-[10px] px-1.5 py-0 hidden sm:inline-flex capitalize'
              >
                {category}
              </Badge>
              <span className='text-xs text-muted-foreground'>
                {formatDistanceToNow(new Date(mostRecent.sent_at), {
                  addSuffix: true
                })}
              </span>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 w-7 p-0 flex-shrink-0'
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? 'Collapse group' : 'Expand group'}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronUp className='h-4 w-4' />
                ) : (
                  <ChevronDown className='h-4 w-4' />
                )}
              </Button>
            </div>
          </div>

          <p className='mt-1 text-sm font-medium text-foreground line-clamp-1'>
            {titlePattern}
          </p>

          <Badge
            variant={badgeVariant}
            className='mt-1 text-[10px] px-1.5 py-0 sm:hidden capitalize'
          >
            {category}
          </Badge>
        </div>
      </div>

      {/* Expanded individual cards — pass callbacks through so every card
          retains Edit / Reuse / Delete capability */}
      {expanded && (
        <div className='border-t divide-y divide-border bg-muted/30'>
          {notifications.map((notification) => (
            <div key={notification.id} className='p-3'>
              <NotificationCard
                notification={notification}
                canDelete={canDelete}
                onEdit={onEdit}
                onReuse={onReuse}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
