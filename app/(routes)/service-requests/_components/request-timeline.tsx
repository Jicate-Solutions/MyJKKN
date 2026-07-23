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
  ServiceRequestStatus,
} from '@/types/service-request';
import { RequestStatusBadge } from './request-status-badge';
import { Badge } from '@/components/ui/badge';

/**
 * Translate a status_change into the action the actor performed, rather than
 * the resulting system status. The old "submitted → in_review" transition is
 * literally accurate but confused approvers — they pressed "Approve", then
 * saw an "In Review" badge on their own row and assumed something failed.
 *
 * The mapping below is the source of truth for what gets shown:
 *   • Any transition into in_review while a prior status existed = a step
 *     approval. Label: "Approved".
 *   • Transition into the terminal approved state = the final approval. Label:
 *     "Approved" (the content text still says "Request approved").
 *   • Other transitions use their new_status as the action.
 *
 * Returning null keeps the legacy from→to rendering, which we want for the
 * very first "draft → submitted" event so it reads "Submitted".
 */
function deriveActionLabel(
  oldStatus: ServiceRequestStatus | null | undefined,
  newStatus: ServiceRequestStatus
): { label: string; tone: 'green' | 'red' | 'amber' | 'blue' | 'gray' } | null {
  if (newStatus === 'approved') return { label: 'Approved', tone: 'green' };
  if (newStatus === 'rejected') return { label: 'Rejected', tone: 'red' };
  if (newStatus === 'returned') return { label: 'Returned for revision', tone: 'amber' };
  if (newStatus === 'fulfilled') return { label: 'Fulfilled', tone: 'green' };
  if (newStatus === 'cancelled') return { label: 'Cancelled', tone: 'gray' };
  if (newStatus === 'closed') return { label: 'Closed', tone: 'gray' };
  // Mid-flow step approval (status into in_review from anything that wasn't
  // already in_review). Show as a clean "Approved" — the content message
  // names the step.
  if (newStatus === 'in_review' && oldStatus && oldStatus !== 'in_review') {
    return { label: 'Approved', tone: 'green' };
  }
  if (newStatus === 'submitted' && oldStatus === 'draft') {
    return { label: 'Submitted', tone: 'blue' };
  }
  return null;
}

const TONE_CLASSES: Record<
  'green' | 'red' | 'amber' | 'blue' | 'gray',
  string
> = {
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200',
  red:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200',
  blue:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200',
  gray:  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200',
};

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

        {/* Status change — show what the actor DID, not the internal status
            transition. Approvers reading the old "Submitted → In Review"
            transition badge on their own row assumed they hadn't approved.
            Now their row shows a clean "Approved" pill. */}
        {entry.event_type === 'status_change' && entry.new_status && (() => {
          const action = deriveActionLabel(entry.old_status, entry.new_status);
          if (action) {
            return (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={cn('text-xs', TONE_CLASSES[action.tone])}>
                  {action.label}
                </Badge>
              </div>
            );
          }
          // Fallback: keep the from→to display for any transition the mapping
          // above doesn't cover.
          if (entry.old_status) {
            return (
              <div className="flex items-center gap-2 mt-1">
                <RequestStatusBadge status={entry.old_status} />
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <RequestStatusBadge status={entry.new_status} />
              </div>
            );
          }
          return (
            <div className="flex items-center gap-2 mt-1">
              <RequestStatusBadge status={entry.new_status} />
            </div>
          );
        })()}

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
