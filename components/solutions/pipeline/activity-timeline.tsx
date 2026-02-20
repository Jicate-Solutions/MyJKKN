'use client';

import { Phone, Mail, ClipboardList, MessageSquare, StickyNote } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ProspectActivity, CommunicationType } from '@/lib/services/solutions/types';

interface ActivityTimelineProps {
  activities: ProspectActivity[];
  className?: string;
}

const ACTIVITY_CONFIG: Record<
  CommunicationType,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  call: { icon: Phone, color: 'text-green-600', bgColor: 'bg-green-100' },
  email: { icon: Mail, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  meeting: { icon: ClipboardList, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  whatsapp: { icon: MessageSquare, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  other: { icon: StickyNote, color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

export function ActivityTimeline({ activities, className }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No activities logged yet</p>
      </div>
    );
  }

  return (
    <div className={cn('relative space-y-0', className)}>
      {/* Vertical line */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-border" />

      {activities.map((activity, index) => {
        const config = ACTIVITY_CONFIG[activity.activity_type] || ACTIVITY_CONFIG.other;
        const Icon = config.icon;

        return (
          <div key={activity.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Icon bubble */}
            <div
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                config.bgColor
              )}
            >
              <Icon className={cn('h-4 w-4', config.color)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {activity.subject && (
                    <p className="text-sm font-medium line-clamp-1">{activity.subject}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-0.5">{activity.summary}</p>
                </div>
                <time className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatDistanceToNow(new Date(activity.activity_date), { addSuffix: true })}
                </time>
              </div>

              {activity.next_action && (
                <div className="mt-2 text-xs bg-muted/50 rounded-md px-2.5 py-1.5 inline-block">
                  <span className="font-medium">Next:</span> {activity.next_action}
                  {activity.next_action_date && (
                    <span className="text-muted-foreground ml-1">
                      (by {format(new Date(activity.next_action_date), 'MMM d, yyyy')})
                    </span>
                  )}
                </div>
              )}

              {activity.created_by_user && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  by {activity.created_by_user.full_name}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
