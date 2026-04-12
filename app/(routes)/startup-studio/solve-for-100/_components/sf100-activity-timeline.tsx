'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardCheck,
  DollarSign,
  Users,
  GitBranch,
  AlertCircle,
} from 'lucide-react';
import {
  useSF100CheckIns,
  useSF100PaidUsers,
  useSF100Interviews,
  useSF100Pivots,
} from '@/hooks/startup-studio';

interface SF100ActivityTimelineProps {
  enrollmentId: string;
}

type EventType = 'check_in' | 'paid_user' | 'interview' | 'pivot';

interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  detail?: string;
  date: string;
}

const EVENT_CONFIG: Record<
  EventType,
  { icon: React.ComponentType<{ className?: string }>; color: string; badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  check_in: {
    icon: ClipboardCheck,
    color: 'text-blue-600 bg-blue-50 border-blue-100',
    badgeVariant: 'secondary',
  },
  paid_user: {
    icon: DollarSign,
    color: 'text-green-600 bg-green-50 border-green-100',
    badgeVariant: 'default',
  },
  interview: {
    icon: Users,
    color: 'text-purple-600 bg-purple-50 border-purple-100',
    badgeVariant: 'outline',
  },
  pivot: {
    icon: GitBranch,
    color: 'text-orange-600 bg-orange-50 border-orange-100',
    badgeVariant: 'destructive',
  },
};

const EVENT_LABELS: Record<EventType, string> = {
  check_in: 'Check-in',
  paid_user: 'Paid User',
  interview: 'Interview',
  pivot: 'Pivot',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TimelineItemSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-1.5 pt-1">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

export function SF100ActivityTimeline({ enrollmentId }: SF100ActivityTimelineProps) {
  const { data: checkInsRaw, isLoading: checkInsLoading } = useSF100CheckIns(enrollmentId);
  const { data: paidUsersRaw, isLoading: paidUsersLoading } = useSF100PaidUsers(enrollmentId);
  const { data: interviewsRaw, isLoading: interviewsLoading } = useSF100Interviews(enrollmentId);
  const { data: pivotsRaw, isLoading: pivotsLoading } = useSF100Pivots(enrollmentId);

  const isLoading = checkInsLoading || paidUsersLoading || interviewsLoading || pivotsLoading;

  // Merge all events into a unified sorted timeline
  const events: TimelineEvent[] = [];

  const checkIns = (checkInsRaw as any)?.data ?? checkInsRaw ?? [];
  const paidUsers = (paidUsersRaw as any)?.data ?? paidUsersRaw ?? [];
  const interviews = (interviewsRaw as any)?.data ?? interviewsRaw ?? [];
  const pivots = (pivotsRaw as any)?.data ?? pivotsRaw ?? [];

  if (Array.isArray(checkIns)) {
    checkIns.forEach((item: any) => {
      events.push({
        id: `ci-${item.id}`,
        type: 'check_in',
        title: 'Weekly check-in submitted',
        detail: item.highlights ?? item.summary ?? item.notes ?? undefined,
        date: item.submitted_at ?? item.created_at,
      });
    });
  }

  if (Array.isArray(paidUsers)) {
    paidUsers.forEach((item: any) => {
      events.push({
        id: `pu-${item.id}`,
        type: 'paid_user',
        title: 'Paid user logged',
        detail: item.user_description ?? item.channel ?? undefined,
        date: item.logged_at ?? item.created_at,
      });
    });
  }

  if (Array.isArray(interviews)) {
    interviews.forEach((item: any) => {
      events.push({
        id: `iv-${item.id}`,
        type: 'interview',
        title: 'Customer interview logged',
        detail: item.key_insight ?? item.summary ?? undefined,
        date: item.interviewed_at ?? item.created_at,
      });
    });
  }

  if (Array.isArray(pivots)) {
    pivots.forEach((item: any) => {
      events.push({
        id: `pv-${item.id}`,
        type: 'pivot',
        title: 'Pivot recorded',
        detail: item.reason ?? item.description ?? undefined,
        date: item.pivoted_at ?? item.created_at,
      });
    });
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <TimelineItemSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground/70">
          Log a paid user or submit a check-in to see your timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="feed" aria-label="Team activity timeline">
      {events.map((event) => {
        const config = EVENT_CONFIG[event.type];
        const Icon = config.icon;

        return (
          <div key={event.id} className="flex gap-3">
            {/* Icon bubble */}
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border ${config.color}`}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-3 border-b border-border/50 last:border-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{event.title}</p>
                  {event.detail && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {event.detail}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  <Badge variant={config.badgeVariant} className="text-[10px] py-0 px-1.5">
                    {EVENT_LABELS[event.type]}
                  </Badge>
                  <time
                    className="text-[10px] text-muted-foreground whitespace-nowrap"
                    dateTime={event.date}
                  >
                    {formatDate(event.date)}
                  </time>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
