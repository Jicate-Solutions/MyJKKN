'use client';

import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  ArrowRight,
  Edit,
  Paperclip,
  Settings,
  StickyNote,
} from 'lucide-react';
import type {
  ServiceRequestTimelineEntry,
  ServiceTimelineEventType,
} from '@/types/service-request';
import { RequestStatusBadge } from './request-status-badge';

interface RequestTimelineProps {
  entries: ServiceRequestTimelineEntry[];
  className?: string;
}

const EVENT_ICONS: Record<ServiceTimelineEventType, React.ElementType> = {
  status_change: ArrowRight,
  comment: MessageSquare,
  internal_note: StickyNote,
  edit: Edit,
  attachment_added: Paperclip,
  system: Settings,
};

export function RequestTimeline({ entries, className }: RequestTimelineProps) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        No activity yet
      </div>
    );
  }

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className={cn('space-y-4', className)}>
      {sortedEntries.map((entry, index) => (
        <TimelineItem key={entry.id} entry={entry} isLast={index === sortedEntries.length - 1} />
      ))}
    </div>
  );
}

function TimelineItem({
  entry,
  isLast,
}: {
  entry: ServiceRequestTimelineEntry;
  isLast: boolean;
}) {
  const Icon = EVENT_ICONS[entry.event_type] || Settings;
  const isInternal = entry.is_internal;

  return (
    <div className="flex gap-3">
      {/* Icon */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isInternal
              ? 'bg-yellow-100 dark:bg-yellow-900/30'
              : 'bg-gray-100 dark:bg-gray-800'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              isInternal
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-gray-500 dark:text-gray-400'
            )}
          />
        </div>
        {!isLast && <div className="w-0.5 flex-1 min-h-[20px] bg-gray-200 dark:bg-gray-700" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 pb-4 min-w-0',
          isInternal && 'bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-3 -mt-1'
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {entry.actor?.full_name || 'System'}
            </span>
            {isInternal && (
              <span className="text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 px-1.5 py-0.5 rounded">
                Internal
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Status change */}
        {entry.event_type === 'status_change' && entry.old_status && entry.new_status && (
          <div className="flex items-center gap-2 mt-1">
            <RequestStatusBadge status={entry.old_status} />
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <RequestStatusBadge status={entry.new_status} />
          </div>
        )}

        {/* Content */}
        {entry.content && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
            {entry.content}
          </p>
        )}
      </div>
    </div>
  );
}
