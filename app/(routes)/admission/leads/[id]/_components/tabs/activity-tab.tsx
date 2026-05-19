'use client';

// ════════════════════════════════════════════════════════════════════════════
// Activity Tab
// Renders the timeline (activities + stage changes) for a lead. Extracted from
// page.tsx as part of the monolith reduction (PR-D / phase 1).
// Pure refactor — zero behavior change.
// ════════════════════════════════════════════════════════════════════════════

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Phone, Mail, Calendar, MessageSquare, TrendingUp, Target, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { TimelineEntry } from '@/lib/services/admission/activity-service';
import { formatDateTimeDMY } from '@/lib/utils/date-format';

const timelineIcons: Record<string, typeof Activity> = {
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  'file-text': Activity,
  'message-square': MessageSquare,
  'message-circle': MessageSquare,
  'git-branch': TrendingUp,
  'check-circle': Target,
  activity: Activity
};

const timelineColors: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  gray: 'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700'
};

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const IconComponent = timelineIcons[entry.icon || 'activity'] || Activity;
  const colorClass = timelineColors[entry.color || 'gray'] || timelineColors.gray;

  // Author label: prefer full_name, then email, then a fallback. The
  // 'Unknown user' case happens when created_by/changed_by points at a
  // profile row that's been deleted (audit-table soft FK pattern).
  // 'System' covers null author (e.g., trigger-written rows).
  const authorLabel = entry.author
    ? entry.author.full_name || entry.author.email || 'Unknown user'
    : 'System';

  return (
    <div className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
      <div className="flex-shrink-0">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${colorClass}`}>
          <IconComponent className="h-4 w-4" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{entry.title}</p>
          <Badge variant="outline" className="text-xs">
            {entry.type === 'stage_change' ? 'Stage' : 'Activity'}
          </Badge>
        </div>
        {entry.description && (
          <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="h-3 w-3" aria-hidden />
          <span className="font-medium text-foreground/80">{authorLabel}</span>
          <span aria-hidden>·</span>
          <span>{formatDateTimeDMY(entry.timestamp)}</span>
        </p>
      </div>
    </div>
  );
}

interface ActivityTabProps {
  timeline: TimelineEntry[];
  timelineLoading: boolean;
}

export function ActivityTab({ timeline, timelineLoading }: ActivityTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Timeline</CardTitle>
        <CardDescription>Recent activities for this lead</CardDescription>
      </CardHeader>
      <CardContent>
        {timelineLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : timeline.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No activity recorded yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((entry) => (
              <TimelineItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
